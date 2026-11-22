/**
 * `assistant-bridge/chat`: the assistant side without a framework. It connects a chat to a
 * host, runs host actions with approval and reads the host context.
 */
export {
  type AssistantReadyInfo,
  type AssistantCommandHandler,
  type AssistantBridgeClient,
  type EmbeddedAssistantOptions,
  createAssistantActionExecutor,
  type ActionConfirmation,
  type AssistantActionExecutorOptions,
  type ActionExecutionOptions,
  type ActionExecutionResult,
  type ActionReadiness,
  type ActionReadinessContext,
  type WaitForHostContextOptions,
  createActionConfirmationController,
  type ActionConfirmationController,
  type PendingActionConfirmation,
  createAssistantCommandDispatcher,
  type AssistantCommandCallbacks,
} from '../assistant-client';
