/**
 * `assistant-bridge/contracts`: the wire contract between a host and an assistant, with Zod as
 * its only dependency. Both sides can depend on it without the runtime.
 */
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
  businessReasonSchema,
  type BusinessReason,
  type ErrorCode,
  type StructuredError,
} from './protocol';

export {
  actionLifecycleEventSchema,
  actionLifecycleStatusSchema,
  type ActionLifecycleEvent,
  type ActionLifecycleListener,
  type ActionLifecycleStatus,
} from './action-lifecycle';
