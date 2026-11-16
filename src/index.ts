export { type ActionExecutionContext, type RegisteredAction } from './action-registry';

export {
  defineAction,
  UI_TARGET_ACTIONS,
  createUiActions,
  focusAction,
  highlightAction,
  navigateAction,
  type NavigateActionOptions,
  type NavigateParams,
  type NavigatePayload,
  type NavigateRoute,
  scrollToAction,
  selectAction,
  clearHighlightAction,
  activateTabAction,
  setExpandedAction,
  setCheckedAction,
  setValueAction,
  type HostActionInput,
  type CreateUiActionsOptions,
  type UiTargetActionName,
} from './actions';

export {
  type AskOptions,
  type AssistantCommandHandler,
  type AssistantBridgeClient,
  type EmbeddedAssistantOptions,
  type HostAssistantCommands,
} from './assistant-client';

export {
  UiTargetRegistry,
  pointOutTargets,
  type PointOutTargetsOptions,
  type UiTarget,
} from './capabilities';

export { queryNavigate } from './connections';

export {
  ASSISTANT_COMMAND_NAMES,
  ASSISTANT_IFRAME_MESSAGES,
  ERROR_CODES,
  HOST_ACTION_NAMES,
  PROTOCOL_VERSION,
  assistantCommandRequestSchema,
  assistantCommandResultSchema,
  assistantPrefillPayloadSchema,
  assistantSubmitPromptPayloadSchema,
  hostActionRequestSchema,
  hostActionResultSchema,
  hostCapabilitySchema,
  hostContextSchema,
  hostPrincipalSchema,
  uiFocusPayloadSchema,
  uiHighlightPayloadSchema,
  uiNavigatePayloadSchema,
  uiScrollToPayloadSchema,
  uiSelectPayloadSchema,
  uiClearHighlightPayloadSchema,
  uiActivateTabPayloadSchema,
  uiSetExpandedPayloadSchema,
  uiSetCheckedPayloadSchema,
  uiSetValuePayloadSchema,
  type AssistantCommandRequest,
  type AssistantCommandResult,
  type ErrorCode,
  type HostActionRequest,
  type HostActionResult,
  type HostCapability,
  type HostContext,
  type HostPrincipal,
  type IntegrationEventMap,
  type IntegrationEventName,
  type IntegrationTimelineEntry,
  type IntegrationDiagnostic,
  type StructuredError,
  type BusinessReason,
  businessReasonSchema,
} from './contracts';

export {
  createHostIntegration,
  type CreateHostIntegrationOptions,
  type HostIntegration,
  type HostIntegrationApi,
  type UpdatePageOptions,
} from './create-host-integration';

export {
  mapHostEntities,
  definePageCatalog,
  emptyPayloadSchema,
  whenPageType,
  whenPageTypeAnd,
  whenPermitted,
  type HostEntityMapping,
  type PageCatalog,
  type PageCatalogDefinition,
  type PageCatalogEntry,
} from './host-context';

export {
  connectEmbeddedAssistant,
  connectHostIframe,
  connectAssistantIframe,
  createAssistantIframeUrl,
  type AssistantConnectionOptions,
  type AssistantConnectionStatus,
  type HostIframeConnectionOptions,
  type AssistantIframeConnectionOptions,
} from './connections';

export {
  createAssistantActionExecutor,
  type ActionConfirmation,
  type AssistantActionExecutorOptions,
  type ActionExecutionOptions,
} from './assistant-client';

export { type ActionReadiness, type ActionReadinessContext } from './assistant-client';

export { type WaitForHostContextOptions } from './assistant-client';

export {
  createIntegrationError,
  isIntegrationErrorCode,
  normalizeIntegrationError,
} from './errors';

export {
  createActionConfirmationController,
  type ActionConfirmationController,
  type PendingActionConfirmation,
} from './assistant-client';

export {
  actionLifecycleEventSchema,
  actionLifecycleStatusSchema,
  type ActionLifecycleEvent,
  type ActionLifecycleStatus,
  type ActionLifecycleListener,
} from './contracts';

export {
  createAssistantCommandDispatcher,
  type AssistantCommandCallbacks,
} from './assistant-client';
