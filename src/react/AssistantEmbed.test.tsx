import { useEffect } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { AssistantEmbed } from '@/react';
import type { FederatedAssistantProps } from '@/react/federation';

const adapters = vi.hoisted(() => ({
  load: vi.fn(),
  mount: vi.fn(),
  dispose: vi.fn(),
  bridge: { reportDiagnostic: vi.fn() },
}));

vi.mock('@/react/context', () => ({
  useIntegration: () => ({ bridge: adapters.bridge }),
}));

vi.mock('@/react/AssistantIframe', () => ({
  default: ({ title }: { title: string }) => <iframe title={title} />,
}));

vi.mock('@/react/federation', () => {
  adapters.load();

  const FederatedAssistant = ({ onStatus }: FederatedAssistantProps) => {
    useEffect(() => {
      adapters.mount();
      onStatus?.('ready');

      return adapters.dispose;
    }, [onStatus]);

    return <div>Federated chat</div>;
  };

  return { FederatedAssistant };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('loads federation only when selected and retries without requiring a host subtree key', async () => {
  const onStatus = vi.fn();
  const iframe = { mode: 'iframe' as const, iframe: { url: '/chat', title: 'Chat' } };

  const federation = {
    mode: 'federation' as const,
    federation: {
      runtimeName: 'host',
      remoteName: 'chat',
      exposedModule: 'EmbeddedAssistant',
      entry: '/remoteEntry.js',
    },
    loadAdapter: () => import('@/react/federation'),
  };

  const { rerender, unmount } = render(<AssistantEmbed config={iframe} onStatus={onStatus} />);

  expect(screen.getByTitle('Chat')).toBeTruthy();
  expect(adapters.load).not.toHaveBeenCalled();

  rerender(<AssistantEmbed config={federation} onStatus={onStatus} />);

  await screen.findByText('Federated chat');
  expect(adapters.load).toHaveBeenCalledOnce();
  expect(onStatus).toHaveBeenCalledWith('loading');
  await waitFor(() => expect(onStatus).toHaveBeenCalledWith('ready'));

  rerender(<AssistantEmbed config={{ ...federation }} onStatus={onStatus} />);
  expect(adapters.mount).toHaveBeenCalledOnce();

  rerender(<AssistantEmbed config={federation} onStatus={onStatus} attempt={1} />);

  await waitFor(() => expect(adapters.mount).toHaveBeenCalledTimes(2));
  expect(adapters.dispose).toHaveBeenCalledOnce();

  rerender(<AssistantEmbed config={iframe} onStatus={onStatus} />);
  expect(screen.getByTitle('Chat')).toBeTruthy();
  expect(adapters.dispose).toHaveBeenCalledTimes(2);
  unmount();
});

it('reports a diagnostic and an error status when the host adapter loader fails', async () => {
  const onStatus = vi.fn();

  render(
    <AssistantEmbed
      config={{
        mode: 'federation',
        federation: {
          runtimeName: 'host',
          remoteName: 'chat',
          exposedModule: 'EmbeddedAssistant',
          entry: '/remoteEntry.js',
        },
        loadAdapter: () => Promise.reject(new Error('federation peer missing')),
      }}
      onStatus={onStatus}
    />,
  );

  await waitFor(() => expect(onStatus).toHaveBeenCalledWith('error'));
  expect(onStatus).toHaveBeenNthCalledWith(1, 'loading');
  expect(adapters.bridge.reportDiagnostic).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'FEDERATION_ADAPTER_LOAD_FAILED', phase: 'adapter-load' }),
  );
});
