export {
  ASSISTANT_COMMAND_NAMES,
  assistantCommandRequestSchema,
  assistantCommandResultSchema,
  assistantPrefillPayloadSchema,
  assistantSubmitPromptPayloadSchema,
  assistantCommandResultDataSchemas,
  type AssistantCommandName,
  type AssistantCommandRequest,
  type AssistantCommandResult,
  type AssistantCommandResultData,
} from './assistant-commands';

export type {
  IntegrationEventMap,
  IntegrationEventName,
  IntegrationTimelineEntry,
  IntegrationDiagnostic,
} from './events';

export {
  HOST_ACTION_NAMES,
  hostActionRequestSchema,
  hostActionResultSchema,
  actionPreviewSchema,
  type ActionPreview,
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
  type HostActionRequest,
  type HostActionResult,
} from './host-actions';

export {
  hostCapabilitySchema,
  hostContextSchema,
  hostPrincipalSchema,
  type HostCapability,
  type HostContext,
  type HostPrincipal,
} from './host-context';

export {
  ASSISTANT_IFRAME_MESSAGES,
  ERROR_CODES,
  PROTOCOL_VERSION,
  isCompatibleProtocolVersion,
  protocolVersionSchema,
  type ErrorCode,
  type StructuredError,
  type BusinessReason,
  businessReasonSchema,
} from './protocol';

export {
  actionLifecycleEventSchema,
  actionLifecycleStatusSchema,
  type ActionLifecycleEvent,
  type ActionLifecycleStatus,
  type ActionLifecycleListener,
} from './action-lifecycle';
