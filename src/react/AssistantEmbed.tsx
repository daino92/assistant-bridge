import { useEffect, useEffectEvent, useState, type ComponentType } from 'react';

import { AssistantIframe, type AssistantIframeProps } from '@/react';
import type { AssistantConnectionStatus } from '@/connections';
import { useIntegration } from '@/react/context';
import type { FederatedAssistantProps } from '@/react/federation';

/** Module shape of `assistant-bridge/react/federation`. */
export interface FederationAdapterModule {
  FederatedAssistant: ComponentType<FederatedAssistantProps>;
}

export type AssistantEmbedConfig =
  | { mode: 'iframe'; iframe: Omit<AssistantIframeProps, 'onStatus'> }
  | {
      mode: 'federation';
      federation: Omit<FederatedAssistantProps, 'onStatus' | 'attempt'>;
      /**
       * Loads the federation adapter, usually
       * `() => import('assistant-bridge/react/federation')`. The host supplies it so
       * `/react` never references the optional federation runtime.
       */
      loadAdapter: () => Promise<FederationAdapterModule>;
    };

export interface AssistantEmbedProps {
  config: AssistantEmbedConfig;
  onStatus: AssistantIframeProps['onStatus'];
  attempt?: number;
}

type DeferredFederatedAssistantProps = FederatedAssistantProps & {
  loadAdapter: () => Promise<FederationAdapterModule>;
};

const DeferredFederatedAssistant = ({ loadAdapter, ...props }: DeferredFederatedAssistantProps) => {
  const { bridge } = useIntegration();
  const [Adapter, setAdapter] = useState<ComponentType<FederatedAssistantProps> | null>(null);

  const reportStatus = useEffectEvent((status: AssistantConnectionStatus) =>
    props.onStatus?.(status),
  );

  const load = useEffectEvent(() => loadAdapter());

  useEffect(() => {
    let active = true;

    reportStatus('loading');

    const timer = setTimeout(() => {
      active = false;
      bridge.reportDiagnostic({
        code: 'FEDERATION_ADAPTER_TIMEOUT',
        phase: 'adapter-load',
        mode: 'federation',
        message: 'Federation adapter module loading timed out.',
      });
      reportStatus('error');
    }, props.timeoutMs ?? 10_000);

    void Promise.resolve()
      .then(() => load())
      .then(
        ({ FederatedAssistant }) => {
          if (!active) {
            return;
          }

          clearTimeout(timer);
          setAdapter(() => FederatedAssistant);
        },
        () => {
          if (active) {
            clearTimeout(timer);
            bridge.reportDiagnostic({
              code: 'FEDERATION_ADAPTER_LOAD_FAILED',
              phase: 'adapter-load',
              mode: 'federation',
              message: 'Federation adapter module could not be loaded.',
            });
            reportStatus('error');
          }
        },
      );

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [props.timeoutMs, bridge]);

  return Adapter ? <Adapter {...props} /> : null;
};

/** Chooses the transport without eagerly importing the federation runtime. */
const AssistantEmbed = ({ config, onStatus, attempt = 0 }: AssistantEmbedProps) => {
  if (config.mode === 'iframe') {
    return <AssistantIframe key={attempt} {...config.iframe} onStatus={onStatus} />;
  }

  return (
    <DeferredFederatedAssistant
      key={JSON.stringify([config.federation, attempt])}
      {...config.federation}
      loadAdapter={config.loadAdapter}
      attempt={attempt}
      onStatus={onStatus}
    />
  );
};

export default AssistantEmbed;
