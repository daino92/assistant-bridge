/**
 * `assistant-bridge`: the host side without a framework. Chats import from
 * `assistant-bridge/chat`; the wire contract lives in `assistant-bridge/contracts`.
 */
export { type ActionExecutionContext, type RegisteredAction } from './action-registry';

export {
  defineAction,
  UI_TARGET_ACTIONS,
  createUiActions,
  type HostActionInput,
  type NavigateActionOptions,
  type NavigateParams,
  type NavigatePayload,
  type NavigateRoute,
  type CreateUiActionsOptions,
  type UiTargetActionName,
} from './actions';

export { type AskOptions, type HostAssistantCommands } from './assistant-client';

export {
  UiTargetRegistry,
  pointOutTargets,
  type PointOutTargetsOptions,
  type UiTarget,
} from './capabilities';

export {
  queryNavigate,
  connectEmbeddedAssistant,
  type AssistantConnectionOptions,
  type AssistantConnectionStatus,
} from './connections';

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

export { createIntegrationError, normalizeIntegrationError } from './errors';
