export {
  createAssistantBridgeClient,
  createHostAssistantCommands,
  type AssistantBridgeClient,
  type EmbeddedAssistantOptions,
  type HostAssistantCommands,
} from './assistant-bridge-client';

export {
  attachAssistantCommandHandler,
  type AssistantCommandHandler,
} from './assistant-command-handler';

export {
  createAssistantActionExecutor,
  type ActionConfirmation,
  type AssistantActionExecutorOptions,
  type ActionExecutionOptions,
} from './assistant-action-executor';

export {
  defaultActionReadiness,
  type ActionReadiness,
  type ActionReadinessContext,
} from './action-readiness';

export { waitForHostContext, type WaitForHostContextOptions } from './wait-for-host-context';

export {
  createActionConfirmationController,
  type ActionConfirmationController,
  type PendingActionConfirmation,
} from './action-confirmation-controller';

export {
  reduceActionProgress,
  finalizeActionProgress,
  type ActionProgressEntry,
} from './action-progress';

export {
  createAssistantCommandDispatcher,
  type AssistantCommandCallbacks,
} from './assistant-command-dispatcher';
