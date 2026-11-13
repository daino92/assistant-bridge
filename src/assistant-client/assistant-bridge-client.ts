import type { HostBridge } from '@/bridge';
import type { AssistantCommandHandler } from '@/assistant-client';
import {
  ASSISTANT_COMMAND_NAMES,
  assistantPrefillPayloadSchema,
  assistantSubmitPromptPayloadSchema,
  type HostContext,
  type ActionLifecycleEvent,
} from '@/contracts';

/**
 * Scoped API shared by direct, federated, and cross-window integrations.
 * The Host passes this interface — not internal services.
 */
export interface AssistantBridgeClient {
  readonly signal?: AbortSignal;
  publishActionLifecycle?: (event: ActionLifecycleEvent) => void;
  subscribeActionLifecycle?: (callback: (event: ActionLifecycleEvent) => void) => () => void;
  /** Returns the latest published host context. */
  getContext(): HostContext;
  /** @deprecated Returns the latest context, not the first one. Use {@link AssistantBridgeClient.getContext}. */
  getInitialContext(): HostContext;
  subscribeContext(callback: (context: HostContext) => void): () => void;
  requestHostAction(
    action: string,
    payload: unknown,
    contextRevision?: number,
    confirmed?: boolean,
    actionExecutionId?: string,
  ): Promise<unknown>;
}

export interface HostAssistantCommands {
  askAbout(prompt: string, selection?: HostContext['selection']): Promise<unknown>;
  prefillAndOpen(text: string): Promise<unknown>;
  open(): Promise<unknown>;
  close(): Promise<unknown>;
  focus(): Promise<unknown>;
  prefill(text: string): Promise<unknown>;
  submitPrompt(prompt: string, metadata?: Record<string, unknown>): Promise<unknown>;
}

export const createAssistantBridgeClient = (bridge: HostBridge): AssistantBridgeClient => {
  const contextManager = bridge.getContextSnapshot();

  return {
    signal: bridge.signal,
    publishActionLifecycle: (event) => bridge.publishActionLifecycle(event),
    subscribeActionLifecycle: (callback) =>
      bridge.signal.aborted ? () => {} : bridge.bus.on('action.lifecycle', callback),
    getContext: () => contextManager(),
    getInitialContext: () => contextManager(),
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

export const createHostAssistantCommands = (bridge: HostBridge): HostAssistantCommands => {
  const commands: HostAssistantCommands = {
    askAbout: async (prompt, selection) => {
      if (selection) {
        bridge.publishEntitySelected(selection.type, selection.id);
      }

      await commands.open();

      return commands.submitPrompt(prompt, {
        contextRevision: bridge.getContextSnapshot()().revision,
        selection,
      });
    },
    prefillAndOpen: async (text) => {
      await commands.open();

      return commands.prefill(text);
    },
    open: () => bridge.sendAssistantCommand(ASSISTANT_COMMAND_NAMES.OPEN, {}),
    close: () => bridge.sendAssistantCommand(ASSISTANT_COMMAND_NAMES.CLOSE, {}),
    focus: () => bridge.sendAssistantCommand(ASSISTANT_COMMAND_NAMES.FOCUS, {}),
    prefill: (text) => {
      const payload = assistantPrefillPayloadSchema.parse({ text });

      return bridge.sendAssistantCommand(ASSISTANT_COMMAND_NAMES.PREFILL, payload);
    },
    submitPrompt: (prompt, metadata) => {
      const payload = assistantSubmitPromptPayloadSchema.parse({ prompt, metadata });

      return bridge.sendAssistantCommand(ASSISTANT_COMMAND_NAMES.SUBMIT_PROMPT, payload);
    },
  };

  return commands;
};

/** Framework-independent connection options for a same-window assistant. */
export interface EmbeddedAssistantOptions {
  bridge: AssistantBridgeClient;
  onReady: (handler: AssistantCommandHandler) => () => void;
}
