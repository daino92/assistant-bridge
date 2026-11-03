import { type ComponentType, type ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHostIntegration } from '@/create-host-integration';
import type { EmbeddedAssistantOptions } from '@/assistant-client';
import { IntegrationProvider } from '@/react';
import { FederatedAssistant } from '@/react/federation';

const connect = vi.hoisted(() => vi.fn());

vi.mock('@/federation', () => ({ connectFederatedAssistant: connect }));

interface WrapperProps {
  children: ReactNode;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanup();
  cleanups
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

const setup = () => {
  const integration = createHostIntegration({ actions: [] });

  cleanups.push(() => integration.bridge.destroy());

  const Wrapper = ({ children }: WrapperProps) => (
    <IntegrationProvider integration={integration}>{children}</IntegrationProvider>
  );

  const session = () => {
    let active = true;

    let resolve: (component: ComponentType<EmbeddedAssistantOptions>) => void = () => {};

    const load = new Promise<ComponentType<EmbeddedAssistantOptions>>((done) => {
      resolve = done;
    });

    const connection = {
      load,
      isActive: () => active,
      bridge: integration.assistantClient,
      onReady: vi.fn(() => () => {}),
      fail: vi.fn(() => {
        active = false;
      }),
      dispose: vi.fn(() => {
        active = false;
      }),
    };

    connect.mockReturnValueOnce(connection);

    return { ...connection, resolve };
  };

  const props = {
    runtimeName: 'test-host',
    remoteName: 'test-chat',
    exposedModule: 'Assistant',
    entry: 'https://chat.example/remoteEntry.js',
    onStatus: vi.fn(),
  };

  return { integration, Wrapper, session, props };
};

describe('FederatedAssistant', () => {
  it('disposes replaced sessions, ignores late loads and passes only the scoped client contract', async () => {
    const { integration, Wrapper, session, props } = setup();
    const first = session();
    const { rerender, unmount } = render(<FederatedAssistant {...props} />, { wrapper: Wrapper });
    const nextStatus = vi.fn();

    rerender(<FederatedAssistant {...props} onStatus={nextStatus} />);
    expect(connect).toHaveBeenCalledOnce();
    act(() => connect.mock.calls[0][1].onStatus('loading'));
    expect(nextStatus).toHaveBeenCalledWith('loading');

    const second = session();

    rerender(<FederatedAssistant {...props} entry="https://next.example/remoteEntry.js" />);
    expect(first.dispose).toHaveBeenCalledOnce();

    const OldRemote = () => <div>Old remote</div>;

    await act(async () => first.resolve(OldRemote));
    expect(screen.queryByText('Old remote')).toBeNull();

    const received = vi.fn();

    const NewRemote = (options: EmbeddedAssistantOptions) => {
      received(options);

      return <div>New remote</div>;
    };

    await act(async () => second.resolve(NewRemote));
    expect(screen.getByText('New remote')).toBeTruthy();
    expect(received).toHaveBeenCalledWith({
      bridge: integration.assistantClient,
      onReady: second.onReady,
    });
    unmount();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it('reports remote render errors and resets the error boundary on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { Wrapper, session, props } = setup();
    const failed = session();
    const { rerender } = render(<FederatedAssistant {...props} />, { wrapper: Wrapper });

    const BrokenRemote = () => {
      throw new Error('Remote render failed');
    };

    await act(async () => failed.resolve(BrokenRemote));
    expect(failed.fail).toHaveBeenCalledOnce();

    const retried = session();

    rerender(<FederatedAssistant {...props} attempt={1} />);
    expect(failed.dispose).toHaveBeenCalledOnce();

    const HealthyRemote = () => <div>Recovered remote</div>;

    await act(async () => retried.resolve(HealthyRemote));
    expect(screen.getByText('Recovered remote')).toBeTruthy();
    expect(retried.fail).not.toHaveBeenCalled();
  });
});
