export { default as IntegrationProvider } from './IntegrationProvider';

export {
  useIntegration,
  useOptionalIntegration,
  useAssistantHost,
  type AssistantHostValue,
} from './context';

export {
  default as AssistantHost,
  type AssistantHighlightOptions,
  type AssistantHostApi,
  type AssistantHostProps,
  type AssistantHostPageRouter,
  type AssistantHostPathRouter,
  type AssistantHostRouter,
} from './AssistantHost';

export {
  HIGHLIGHT_ATTRIBUTE,
  useUiTarget,
  usePageEntities,
  useAssistantPanel,
  useAssistantIframeConnection,
  useAssistantContext,
  useAssistantIntegration,
  type UseAssistantIntegrationOptions,
  useAssistantCommandHandler,
  useHostIntegration,
  type UseHostIntegrationOptions,
  useHostPageContext,
  useActionConfirmation,
  type HostPageContextOptions,
  type UiTargetOptions,
  type UseAssistantIframeConnectionOptions,
} from './hooks';

export { default as AssistantIframe, type AssistantIframeProps } from './AssistantIframe';

export {
  default as AssistantEmbed,
  type AssistantEmbedConfig,
  type AssistantEmbedProps,
  type FederationAdapterModule,
} from './AssistantEmbed';
