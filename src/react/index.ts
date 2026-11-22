/** `assistant-bridge/react`: the React host. Chat hooks are in `assistant-bridge/chat/react`. */
export { useAssistantHost, type AssistantHostValue } from './context';

export {
  default as AssistantHost,
  type AssistantHighlightOptions,
  type AssistantHostApi,
  type AssistantHostProps,
  type AssistantHostPageRouter,
  type AssistantHostPathRouter,
  type AssistantHostRouter,
} from './AssistantHost';

export { useUiTarget, usePageEntities, useAssistantPanel, type UiTargetOptions } from './hooks';
