export { default as IntegrationProvider } from './IntegrationProvider';
export { useIntegration } from './context';

export {
  useUiTarget,
  useAssistantPanel,
  useAssistantIframeConnection,
  useAssistantContext,
  useAssistantCommandHandler,
  useHostIntegration,
  useHostPageContext,
  useAskAi,
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
} from './AssistantEmbed';
