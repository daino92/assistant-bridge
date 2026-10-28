import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createHostIntegration } from '@/create-host-integration';
import { attachAssistantCommandHandler } from '@/assistant-client';
import { IntegrationProvider, useAssistantPanel } from '@/react';

interface WrapperProps {
  children: ReactNode;
}

const disposers: Array<() => void> = [];

afterEach(() => {
  cleanup();
  disposers
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
});

const setup = () => {
  const integration = createHostIntegration({ appId: 'test', actions: [] });

  disposers.push(() => integration.bridge.destroy());

  const Wrapper = ({ children }: WrapperProps) => (
    <StrictMode>
      <IntegrationProvider integration={integration}>{children}</IntegrationProvider>
    </StrictMode>
  );

  const hook = renderHook(() => useAssistantPanel(), { wrapper: Wrapper });

  return { integration, ...hook };
};

describe('useAssistantPanel', () => {
  it('handles correlated host commands and releases its subscription on unmount', async () => {
    const { integration, result, unmount } = setup();
    const detach = attachAssistantCommandHandler(integration.bridge, () => 'ack');

    disposers.push(detach);
    integration.bridge.notifyAssistantReady('test');
    expect(result.current.open).toBe(false);

    await act(async () => {
      await integration.assistantCommands.open();
    });
    expect(result.current.open).toBe(true);
    await act(async () => {
      await integration.assistantCommands.close();
    });
    expect(result.current.open).toBe(false);
    await act(async () => {
      await integration.assistantCommands.prefill('Draft');
    });
    expect(result.current.open).toBe(true);
    expect(integration.bridge.bus.listenerCount('assistant.command.request')).toBe(2);
    unmount();
    expect(integration.bridge.bus.listenerCount('assistant.command.request')).toBe(1);
  });

  it('keeps local visibility separate from commands and preserves it through reconnect', () => {
    const { integration, result, rerender } = setup();

    act(() => result.current.openPanel());
    expect(result.current.open).toBe(true);
    expect(integration.bridge.isAssistantAvailable()).toBe(false);
    act(() => result.current.onStatus('error'));
    expect(result.current.status).toBe('error');

    const onStatus = result.current.onStatus;

    act(() => result.current.reconnect());
    expect(result.current).toMatchObject({ open: true, status: 'loading', attempt: 1 });
    act(() => result.current.onStatus('ready'));
    expect(result.current.status).toBe('ready');
    act(() => result.current.closePanel());
    expect(result.current.open).toBe(false);
    rerender();
    expect(result.current.onStatus).toBe(onStatus);
  });
});
