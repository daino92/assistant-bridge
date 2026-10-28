import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssistantBridgeClient, AssistantCommandHandler } from '@/assistant-client';
import type { AssistantIframeConnectionOptions } from '@/connections';
import { PROTOCOL_VERSION, type AssistantCommandRequest, type HostContext } from '@/contracts';
import {
  useAssistantIframeConnection,
  useAssistantCommandHandler,
  useAssistantContext,
  type UseAssistantIframeConnectionOptions,
} from '@/react/hooks';

const connect = vi.hoisted(() => vi.fn());

vi.mock('@/connections', () => ({ connectAssistantIframe: connect }));

const INITIAL_URL = window.location.href;

const CONTEXT: HostContext = {
  appId: 'test',
  route: '/',
  page: { title: 'Home', type: 'home' },
  capabilities: [],
  revision: 0,
};

const REQUEST: AssistantCommandRequest = {
  protocolVersion: PROTOCOL_VERSION,
  requestId: crypto.randomUUID(),
  command: 'assistant.open',
  payload: {},
};

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', INITIAL_URL);
  vi.resetAllMocks();
});

const createClient = (initial: HostContext = CONTEXT) => {
  let context = initial;
  const listeners = new Set<(context: HostContext) => void>();

  const unsubscribe = vi.fn((listener: (context: HostContext) => void) =>
    listeners.delete(listener),
  );

  const client: AssistantBridgeClient = {
    getInitialContext: () => context,
    subscribeContext: (listener) => {
      listeners.add(listener);

      return () => {
        unsubscribe(listener);
      };
    },
    requestHostAction: async () => undefined,
  };

  return {
    client,
    unsubscribe,
    publish: (next: HostContext) => {
      context = next;
      listeners.forEach((listener) => listener(next));
    },
  };
};

describe('assistant-side React hooks', () => {
  it('keeps iframe callbacks current without reconnecting and disconnects when disabled', () => {
    const disconnect = vi.fn();

    connect.mockImplementation((options: AssistantIframeConnectionOptions) => () => {
      disconnect();
      options.onClient(undefined);
    });

    const firstCommand = vi.fn(() => 'first');
    const firstClient = vi.fn();

    const options: UseAssistantIframeConnectionOptions = {
      hostOrigin: 'https://host.example',
      onCommand: firstCommand,
      onClient: firstClient,
    };

    const { rerender, unmount } = renderHook(
      (props: UseAssistantIframeConnectionOptions) => useAssistantIframeConnection(props),
      { initialProps: options },
    );

    const nextCommand = vi.fn(() => 'next');
    const nextClient = vi.fn();

    rerender({ ...options, onCommand: nextCommand, onClient: nextClient });
    expect(connect).toHaveBeenCalledOnce();

    const connectionOptions = connect.mock.calls[0][0] as AssistantIframeConnectionOptions;

    expect(connectionOptions.onCommand(REQUEST)).toBe('next');

    const { client } = createClient();

    act(() => connectionOptions.onClient(client));
    expect(nextClient).toHaveBeenCalledWith(client);
    expect(firstClient).not.toHaveBeenCalled();
    expect(firstCommand).not.toHaveBeenCalled();
    rerender({ ...options, onCommand: nextCommand, onClient: nextClient, enabled: false });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(nextClient).toHaveBeenLastCalledWith(undefined);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('skips standalone initialization without an origin and reads the embedding query on mount', () => {
    const options = { onCommand: vi.fn(), onClient: vi.fn() };
    const standalone = renderHook(() => useAssistantIframeConnection(options));

    expect(connect).not.toHaveBeenCalled();
    standalone.unmount();

    const url = new URL(window.location.href);

    url.searchParams.set('hostOrigin', 'https://host.example');
    window.history.replaceState(null, '', url);

    const disconnect = vi.fn();

    connect.mockReturnValue(disconnect);

    const embedded = renderHook(() => useAssistantIframeConnection(options));

    expect(connect.mock.calls[0][0].hostOrigin).toBe('https://host.example');
    embedded.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('uses the latest command implementation and cleans up replaced readiness registrations', () => {
    const firstCleanup = vi.fn();
    const onReady = vi.fn((_handler: AssistantCommandHandler) => firstCleanup);
    const firstCommand = vi.fn(() => 'first');

    const { rerender, unmount } = renderHook(
      ({ command, ready }) => useAssistantCommandHandler(command, ready),
      { initialProps: { command: firstCommand, ready: onReady } },
    );

    const latestCommand = vi.fn(() => 'latest');

    rerender({ command: latestCommand, ready: onReady });
    expect(onReady).toHaveBeenCalledOnce();
    expect(onReady.mock.calls[0][0](REQUEST)).toBe('latest');
    expect(firstCommand).not.toHaveBeenCalled();

    const nextCleanup = vi.fn();
    const nextReady = vi.fn((_handler: AssistantCommandHandler) => nextCleanup);

    rerender({ command: latestCommand, ready: nextReady });
    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(nextReady).toHaveBeenCalledOnce();
    unmount();
    expect(nextCleanup).toHaveBeenCalledOnce();
  });

  it('subscribes to the active client only and clears context when it disconnects', () => {
    const first = createClient();
    const second = createClient({ ...CONTEXT, appId: 'next-host' });

    const { result, rerender, unmount } = renderHook(
      (client: AssistantBridgeClient | undefined) => useAssistantContext(client),
      { initialProps: first.client as AssistantBridgeClient | undefined },
    );

    expect(result.current).toEqual(CONTEXT);
    act(() => first.publish({ ...CONTEXT, route: '/catalog', revision: 1 }));
    expect(result.current?.route).toBe('/catalog');
    rerender(second.client);
    expect(first.unsubscribe).toHaveBeenCalledOnce();
    expect(result.current?.appId).toBe('next-host');
    act(() => first.publish({ ...CONTEXT, route: '/old-client', revision: 2 }));
    expect(result.current?.appId).toBe('next-host');
    rerender(undefined);
    expect(second.unsubscribe).toHaveBeenCalledOnce();
    expect(result.current).toBeUndefined();
    unmount();
  });
});
