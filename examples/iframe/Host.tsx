import { useCallback, useState } from 'react';
import type { AssistantConnectionStatus } from 'assistant-bridge';
import { AssistantIframe, IntegrationProvider, useHostIntegration } from 'assistant-bridge/react';

interface Props {
  chatUrl: string;
}

const Host = ({ chatUrl }: Props) => {
  const integration = useHostIntegration({
    actions: [],
    initialRoute: '/renewals',
    initialPage: { title: 'Renewals', type: 'renewals' },
  });

  const [status, setStatus] = useState<AssistantConnectionStatus>('loading');
  const [error, setError] = useState('');

  const prefillChat = useCallback(async () => {
    setError('');

    try {
      await integration.assistantCommands.prefillAndOpen('Help me with my renewals.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to prefill chat.');
    }
  }, [integration]);

  return (
    <IntegrationProvider integration={integration}>
      <h1>Renewals host</h1>
      <p role="status">Chat connection: {status}</p>
      <button onClick={prefillChat} disabled={status !== 'ready'}>
        Ask about renewals
      </button>
      {error && <p role="alert">{error}</p>}
      <AssistantIframe
        url={chatUrl}
        title="Renewals chat"
        onStatus={setStatus}
        width="100%"
        height={480}
      />
    </IntegrationProvider>
  );
};

export default Host;
