import {
  createAssistantActionExecutor,
  type ActionConfirmation,
  type AssistantCommandHandler,
} from '@/assistant-client';
import { connectEmbeddedAssistant } from '@/connections';
import {
  ERROR_CODES,
  PROTOCOL_VERSION,
  type AssistantCommandName,
  type AssistantCommandResultData,
  type AssistantCommandRequest,
  type HostContext,
} from '@/contracts';
import type { HostIntegration } from '@/create-host-integration';
import { createIntegrationError } from '@/errors';

/** What a conforming assistant answers, by command; the type requires every command. */
const ANSWERS: AssistantCommandResultData = {
  'assistant.open': { opened: true },
  'assistant.close': { closed: true },
  'assistant.focus': { focused: true },
  'assistant.prefill': { prefilled: true },
  'assistant.submitPrompt': { accepted: true },
};

export interface TestAssistantOptions {
  /**
   * Answer to approval requests for actions with `requiresConfirmation`. `true` approves,
   * `false` (default) declines, a function decides per request.
   */
  approve?: boolean | ((request: ActionConfirmation) => boolean);
  /**
   * Wait, after `ui.navigate`, until the host publishes the requested route (as a real
   * assistant does). Off by default, for tests whose router does not change the route.
   */
  waitForNavigation?: boolean;
  /** Overrides the answer to host commands; throw to refuse one. */
  onCommand?: AssistantCommandHandler;
}

export interface TestAssistant {
  /** The context the host published last. */
  context(): HostContext;
  /** Names of the actions the assistant may request right now. */
  capabilities(): string[];
  /**
   * Requests a host action as an assistant does: availability, approval (see `approve`),
   * validation and the handler. Resolves with its result or rejects with an `Error` that
   * carries `code` and, when public, `reason`.
   */
  run(action: string, payload?: unknown): Promise<unknown>;
  /** Commands the host sent (`assistant.open`, `assistant.submitPrompt`, …), oldest first. */
  readonly commands: AssistantCommandRequest[];
  /** Approval requests the assistant received, oldest first. */
  readonly confirmations: ActionConfirmation[];
  /** Disconnects; later commands from the host reject with `RECEIVER_UNAVAILABLE`. */
  dispose(): void;
}

/**
 * A same-window assistant for host tests. It connects to the integration, answers host commands
 * like a conforming assistant and runs actions through the SDK executor, so a test covers the
 * same checks as the real assistant without knowing the wire protocol.
 */
export const connectTestAssistant = (
  integration: HostIntegration,
  { approve = false, waitForNavigation = false, onCommand }: TestAssistantOptions = {},
): TestAssistant => {
  const commands: AssistantCommandRequest[] = [];
  const confirmations: ActionConfirmation[] = [];
  const connection = connectEmbeddedAssistant(integration, {});

  const detach = connection.onReady(
    (request) => {
      commands.push(request);

      if (onCommand) {
        return onCommand(request);
      }

      if (!Object.hasOwn(ANSWERS, request.command)) {
        throw createIntegrationError(ERROR_CODES.UNKNOWN_COMMAND);
      }

      return ANSWERS[request.command as AssistantCommandName];
    },
    { protocolVersion: PROTOCOL_VERSION },
  );

  const executor = createAssistantActionExecutor(connection.bridge, {
    requestConfirmation: async (request) => {
      confirmations.push(request);

      return typeof approve === 'function' ? approve(request) : approve;
    },
    ...(waitForNavigation
      ? {}
      : { readiness: { 'ui.navigate': () => true }, contextWait: { settleMs: 0 } }),
  });

  return {
    context: () => connection.bridge.getContext(),
    capabilities: () => connection.bridge.getContext().capabilities.map((item) => item.name),
    run: (action, payload = {}) => executor.executeAction(action, payload),
    commands,
    confirmations,
    dispose: () => {
      detach();
      connection.dispose();
    },
  };
};
