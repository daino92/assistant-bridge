export { default as IntegrationProvider } from './IntegrationProvider';
export { useIntegration, useOptionalIntegration } from './context';

export {
  useUiTarget,
  useAssistantPanel,
  useAssistantIframeConnection,
  useAssistantContext,
  useAssistantIntegration,
  type UseAssistantIntegrationOptions,
  useAssistantCommandHandler,
  useHostIntegration,
  type UseHostIntegrationOptions,
  useHostPageContext,
  useHostPageContextFromCatalog,
  useAskAi,
  useActionConfirmation,
  type HostPageContextOptions,
  type HostPageContextFromCatalogOptions,
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
