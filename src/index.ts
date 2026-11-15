export {
  /** @deprecated Internal building block; it will no longer be exported from the root in a future beta. Use `createHostIntegration` or `AssistantHost`. */
  HostActionRegistry,
  type ActionExecutionContext,
  type RegisteredAction,
} from './action-registry';

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
  /** @deprecated Demo action for fixed entity types; it will be removed in a future beta. Use `defineAction`. */
  openDetailsAction,
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
  createAssistantBridgeClient,
  createHostAssistantCommands,
  attachAssistantCommandHandler,
  type AskOptions,
  type AssistantCommandHandler,
  type AssistantBridgeClient,
  type EmbeddedAssistantOptions,
  type HostAssistantCommands,
} from './assistant-client';

export {
  /** @deprecated Internal building block; it will no longer be exported from the root in a future beta. Use `createHostIntegration` or `AssistantHost`. */
  HostBridge,
  /** @deprecated Internal building block; it will no longer be exported from the root in a future beta. Use `createHostIntegration` or `AssistantHost`. */
  RequestResponseChannel,
  /** @deprecated Internal building block; it will no longer be exported from the root in a future beta. Use `createHostIntegration` or `AssistantHost`. */
  TypedEventBus,
} from './bridge';

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
  /** @deprecated Demo schema; it will be removed in a future beta. Define your own schema with `defineAction`. */
  catalogFilterPayloadSchema,
  hostActionRequestSchema,
  hostActionResultSchema,
  hostCapabilitySchema,
  hostContextSchema,
  hostPrincipalSchema,
  /** @deprecated Demo schema; it will be removed in a future beta. Define your own schema with `defineAction`. */
  recordsFilterPayloadSchema,
  /** @deprecated Demo schema; it will be removed in a future beta. Define your own schema with `defineAction`. */
  recordsSortPayloadSchema,
  uiFocusPayloadSchema,
  uiHighlightPayloadSchema,
  uiNavigatePayloadSchema,
  /** @deprecated Demo schema; it will be removed in a future beta. Define your own schema with `defineAction`. */
  uiOpenDetailsPayloadSchema,
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
  /** @deprecated Internal building block; it will no longer be exported from the root in a future beta. Use `createHostIntegration` or `AssistantHost`. */
  HostContextManager,
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
  /** @deprecated Internal transport; it will no longer be exported from the root in a future beta. Use `AssistantEmbed` or `connectHostIframe`. */
  attachHostPort,
  /** @deprecated Internal transport; it will no longer be exported from the root in a future beta. Use `useAssistantIntegration` or `connectAssistantIframe`. */
  createPortAssistantClient,
} from './bridge';

export {
  /** @deprecated Internal; it will no longer be exported in a future beta. Use `connectEmbeddedAssistant` or `AssistantHost` with `connection="embedded"`. */
  createAssistantConnection,
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

export {
  /** @deprecated Internal default of the action executor; it will no longer be exported in a future beta. */
  defaultActionReadiness,
  type ActionReadiness,
  type ActionReadinessContext,
} from './assistant-client';

export {
  /** @deprecated Internal to the action executor; it will no longer be exported in a future beta. */
  waitForHostContext,
  type WaitForHostContextOptions,
} from './assistant-client';

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
  /** @deprecated Internal to `createChatSession`; it will no longer be exported in a future beta. */
  reduceActionProgress,
  /** @deprecated Internal to `createChatSession`; it will no longer be exported in a future beta. */
  finalizeActionProgress,
  type ActionProgressEntry,
} from './assistant-client';

export {
  createAssistantCommandDispatcher,
  type AssistantCommandCallbacks,
} from './assistant-client';
