import { useEffect, useEffectEvent, useState, type ComponentType } from 'react';

import type { EmbeddedAssistantOptions } from '@/assistant-client';
import { connectFederatedAssistant } from '@/federation';
import type { AssistantConnectionOptions } from '@/connections';
import type { AssistantConnectionStatus } from '@/connections';
import { useIntegration } from '@/react/context';
import { RemoteErrorBoundary } from '@/react/federation';

export interface FederatedAssistantProps extends AssistantConnectionOptions {
  runtimeName: string;
  remoteName: string;
  exposedModule: string;
  entry: string;
  attempt?: number;
}

interface LoadedAssistant {
  Remote: ComponentType<EmbeddedAssistantOptions>;
  props: EmbeddedAssistantOptions;
  fail: () => void;
}

const FederatedSession = ({
  runtimeName,
  remoteName,
  exposedModule,
  entry,
  attempt = 0,
  onStatus,
  timeoutMs,
  assistantId,
}: FederatedAssistantProps) => {
  const integration = useIntegration();
  const [loaded, setLoaded] = useState<LoadedAssistant | null>(null);

  const reportStatus = useEffectEvent((status: AssistantConnectionStatus) => onStatus?.(status));

  useEffect(() => {
    const connection = connectFederatedAssistant<ComponentType<EmbeddedAssistantOptions>>(
      integration,
      {
        runtimeName,
        remoteName,
        exposedModule,
        entry,
        attempt,
        onStatus: (status) => reportStatus(status),
        timeoutMs,
        assistantId,
      },
    );

    void connection.load.then((Remote) => {
      if (Remote && connection.isActive()) {
        setLoaded({
          Remote,
          props: { bridge: connection.bridge, onReady: connection.onReady },
          fail: () =>
            connection.fail({
              code: 'FEDERATION_RENDER_FAILED',
              phase: 'render',
              mode: 'federation',
              message: 'Federated assistant rendering failed.',
            }),
        });
      }
    });

    return connection.dispose;
  }, [integration, runtimeName, remoteName, exposedModule, entry, attempt, timeoutMs, assistantId]);

  if (!loaded) {
    return null;
  }

  const { Remote, props, fail } = loaded;

  return (
    <RemoteErrorBoundary onError={fail}>
      <Remote {...props} />
    </RemoteErrorBoundary>
  );
};

/** A changed remote configuration or retry attempt starts a fresh rendering session. */
const FederatedAssistant = (props: FederatedAssistantProps) => (
  <FederatedSession
    key={JSON.stringify([
      props.runtimeName,
      props.remoteName,
      props.exposedModule,
      props.entry,
      props.attempt ?? 0,
      props.timeoutMs,
      props.assistantId,
    ])}
    {...props}
  />
);

export default FederatedAssistant;
