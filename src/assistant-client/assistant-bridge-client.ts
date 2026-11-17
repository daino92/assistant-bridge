import type { HostBridge } from '@/bridge';
import type { AssistantCommandHandler } from '@/assistant-client';
import {
  ASSISTANT_COMMAND_NAMES,
  ERROR_CODES,
  assistantCommandResultDataSchemas,
  assistantPrefillPayloadSchema,
  assistantSubmitPromptPayloadSchema,
  type AssistantCommandName,
  type AssistantCommandResultData,
  type HostContext,
  type ActionLifecycleEvent,
} from '@/contracts';
import { toIntegrationError } from '@/errors';

/**
 * Scoped API shared by direct, federated, and cross-window integrations.
 * The Host passes this interface — not internal services.
 */
export interface AssistantBridgeClient {
  readonly signal?: AbortSignal;
  /** Separate read-only request; optional for older clients. */
  previewHostAction?: (
    action: string,
    payload: unknown,
    contextRevision?: number,
  ) => Promise<unknown>;
  publishActionLifecycle?: (event: ActionLifecycleEvent) => void;
  subscribeActionLifecycle?: (callback: (event: ActionLifecycleEvent) => void) => () => void;
  /** Returns the latest published host context. */
  getContext(): HostContext;
  subscribeContext(callback: (context: HostContext) => void): () => void;
  requestHostAction(
    action: string,
    payload: unknown,
    contextRevision?: number,
    confirmed?: boolean,
    actionExecutionId?: string,
  ): Promise<unknown>;
}

/** Options for {@link HostAssistantCommands.askAbout}. */
export interface AskOptions {
  /** Entity the question is about; published to the assistant before the prompt. */
  selection?: HostContext['selection'];
  /** Extra data for the assistant, for example the text of the section the user asked about. */
  metadata?: Record<string, unknown>;
}

export interface HostAssistantCommands {
  /**
   * Opens the assistant and submits the prompt. The second argument is either the selection
   * (the original signature) or {@link AskOptions}.
   */
  askAbout(
    prompt: string,
    options?: AskOptions | HostContext['selection'],
  ): Promise<AssistantCommandResultData['assistant.submitPrompt']>;
  prefillAndOpen(text: string): Promise<AssistantCommandResultData['assistant.prefill']>;
  open(): Promise<AssistantCommandResultData['assistant.open']>;
  close(): Promise<AssistantCommandResultData['assistant.close']>;
  focus(): Promise<AssistantCommandResultData['assistant.focus']>;
  prefill(text: string): Promise<AssistantCommandResultData['assistant.prefill']>;
  /** Resolves with `{ accepted: true }` once the assistant took the prompt, not when it answered. */
  submitPrompt(
    prompt: string,
    metadata?: Record<string, unknown>,
  ): Promise<AssistantCommandResultData['assistant.submitPrompt']>;
}

export const createAssistantBridgeClient = (bridge: HostBridge): AssistantBridgeClient => {
  const contextManager = bridge.getContextSnapshot();

  return {
    signal: bridge.signal,
    previewHostAction: (action, payload, revision) =>
      bridge.previewHostAction(action, payload, revision),
    publishActionLifecycle: (event) => bridge.publishActionLifecycle(event),
    subscribeActionLifecycle: (callback) =>
      bridge.signal.aborted ? () => {} : bridge.bus.on('action.lifecycle', callback),
    getContext: () => contextManager(),
    subscribeContext: (callback) =>
      bridge.signal.aborted
        ? () => {}
        : bridge.bus.on('host.context.changed', ({ context }) =>
            callback(structuredClone(context)),
          ),
    requestHostAction: (action, payload, contextRevision, confirmed, actionExecutionId) =>
      bridge.requestHostAction(action, payload, contextRevision, confirmed, actionExecutionId),
  };
};

const toAskOptions = (options?: AskOptions | HostContext['selection']): AskOptions => {
  if (!options) {
    return {};
  }

  // A selection always has `type` and `id`; AskOptions has neither.
  return 'type' in options && 'id' in options ? { selection: options } : options;
};

/** Sends a command and checks the assistant's answer against the command's result schema. */
const send = async <K extends AssistantCommandName>(
  bridge: HostBridge,
  command: K,
  payload: unknown,
): Promise<AssistantCommandResultData[K]> => {
  const data = await bridge.sendAssistantCommand(command, payload);
  const parsed = assistantCommandResultDataSchemas[command].safeParse(data);

  if (!parsed.success) {
    // An assistant that answers in another shape does not implement this protocol version.
    throw toIntegrationError({ code: ERROR_CODES.INVALID_PAYLOAD });
  }

  return parsed.data as AssistantCommandResultData[K];
};

export const createHostAssistantCommands = (bridge: HostBridge): HostAssistantCommands => {
  const commands: HostAssistantCommands = {
    askAbout: async (prompt, options) => {
      const { selection, metadata } = toAskOptions(options);

      if (selection) {
        bridge.publishEntitySelected(selection.type, selection.id);
      }

      await commands.open();

      // The host's own fields win, so metadata cannot misreport the context revision.
      return commands.submitPrompt(prompt, {
        ...metadata,
        contextRevision: bridge.getContextSnapshot()().revision,
        selection,
      });
    },
    prefillAndOpen: async (text) => {
      await commands.open();

      return commands.prefill(text);
    },
    open: () => send(bridge, ASSISTANT_COMMAND_NAMES.OPEN, {}),
    close: () => send(bridge, ASSISTANT_COMMAND_NAMES.CLOSE, {}),
    focus: () => send(bridge, ASSISTANT_COMMAND_NAMES.FOCUS, {}),
    prefill: (text) =>
      send(bridge, ASSISTANT_COMMAND_NAMES.PREFILL, assistantPrefillPayloadSchema.parse({ text })),
    submitPrompt: (prompt, metadata) =>
      send(
        bridge,
        ASSISTANT_COMMAND_NAMES.SUBMIT_PROMPT,
        assistantSubmitPromptPayloadSchema.parse({ prompt, metadata }),
      ),
  };

  return commands;
};

/** Framework-independent connection options for a same-window assistant. */
/** What the assistant tells the host when it registers its command handler. */
export interface AssistantReadyInfo {
  /** The assistant's `PROTOCOL_VERSION`; the host refuses an incompatible one. */
  protocolVersion: string;
}

export interface EmbeddedAssistantOptions {
  bridge: AssistantBridgeClient;
  /**
   * Registers the assistant's command handler and marks it ready. Pass `{ protocolVersion }`;
   * `useAssistantIntegration` and `useAssistantCommandHandler` do. Returns the cleanup.
   */
  onReady: (handler: AssistantCommandHandler, info?: AssistantReadyInfo) => () => void;
}
