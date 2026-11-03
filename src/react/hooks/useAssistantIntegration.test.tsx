import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { connectAssistantIframe, connectEmbeddedAssistant } from '@/connections';
import { createHostIntegration, type HostIntegration } from '@/create-host-integration';
import { PROTOCOL_VERSION, type AssistantCommandRequest } from '@/contracts';
import { useAssistantIntegration, type UseAssistantIntegrationOptions } from '@/react/hooks';

vi.mock('@/connections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/connections')>()),
  connectAssistantIframe: vi.fn(),
}));

const integrations: HostIntegration[] = [];

const createHost = (requiresConfirmation = false) => {
  const handler = vi.fn(({ value }: { value: string }) => ({ value }));

  const integration = createHostIntegration({
    actions: [
      {
        name: 'test.action',
        description: 'Test action',
        schema: z.object({ value: z.string() }),
        requiresConfirmation,
        handler,
      },
    ],
  });

  integrations.push(integration);

  return { integration, handler };
};

const Wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

const request = (command: string, payload: unknown = {}): AssistantCommandRequest => ({
  protocolVersion: PROTOCOL_VERSION,
  requestId: crypto.randomUUID(),
  command,
  payload,
});

afterEach(async () => {
  cleanup();
  await Promise.resolve();
  integrations.splice(0).forEach((integration) => integration.dispose());
  vi.resetAllMocks();
});

it('registers commands in Strict Mode and uses fresh callbacks without reconnecting', async () => {
  const { integration } = createHost();
  const connection = connectEmbeddedAssistant(integration, { onStatus: vi.fn() });
  const onReady = vi.fn(connection.onReady);
  const firstSubmit = vi.fn();
  const nextSubmit = vi.fn();

  const options: UseAssistantIntegrationOptions = {
    bridge: connection.bridge,
    onReady,
    commands: { onSubmit: firstSubmit },
  };

  const { result, rerender, unmount } = renderHook((props) => useAssistantIntegration(props), {
    initialProps: options,
    wrapper: Wrapper,
  });

  expect(result.current.isConnected).toBe(true);
  await expect(integration.assistantCommands.submitPrompt('first')).resolves.toEqual({
    acknowledged: true,
  });
  expect(firstSubmit).toHaveBeenCalledWith('first', undefined);

  const registrations = onReady.mock.calls.length;

  rerender({ ...options, commands: { onSubmit: nextSubmit } });
  await integration.assistantCommands.submitPrompt('second', { source: 'host' });
  expect(nextSubmit).toHaveBeenCalledWith('second', { source: 'host' });
  expect(onReady).toHaveBeenCalledTimes(registrations);
  await expect(integration.assistantCommands.focus()).rejects.toMatchObject({
    code: 'UNKNOWN_COMMAND',
  });
  unmount();
  expect(integration.bridge.isAssistantAvailable()).toBe(false);
  connection.dispose();
});

it('publishes host context changes and executes validated actions through the host', async () => {
  const { integration, handler } = createHost();

  const { result } = renderHook(() =>
    useAssistantIntegration({ bridge: integration.assistantClient, commands: {} }),
  );

  act(() => {
    integration.updatePage({ route: '/offers', page: { title: 'Offers', type: 'offers' } });
  });
  expect(result.current.context?.route).toBe('/offers');
  await expect(result.current.executeHostAction('test.action', { value: 'ok' })).resolves.toEqual({
    value: 'ok',
  });
  await expect(
    result.current.executeHostAction('test.action', { value: 42 }),
  ).rejects.toMatchObject({
    code: 'INVALID_PAYLOAD',
  });
  await expect(result.current.executeHostAction('unknown', {})).rejects.toMatchObject({
    code: 'ACTION_NOT_AVAILABLE',
  });
  expect(handler).toHaveBeenCalledOnce();
});

it('owns approval UI state and keeps pending actions alive across rerenders', async () => {
  const { integration, handler } = createHost(true);

  const { result, rerender } = renderHook(() =>
    useAssistantIntegration({ bridge: integration.assistantClient, commands: {}, actions: {} }),
  );

  let pending: Promise<unknown>;

  act(() => {
    pending = result.current.executeHostAction('test.action', { value: 'approved' });
  });
  expect(result.current.confirmation?.name).toBe('test.action');
  expect(handler).not.toHaveBeenCalled();
  rerender();
  expect(result.current.confirmation?.name).toBe('test.action');
  await act(async () => {
    result.current.approve();
    await expect(pending).resolves.toEqual({ value: 'approved' });
  });
  expect(result.current.confirmation).toBeUndefined();

  act(() => {
    pending = result.current.executeHostAction('test.action', { value: 'rejected' });
  });

  const rejected = expect(pending!).rejects.toMatchObject({ code: 'ACTION_REJECTED' });

  await act(async () => {
    result.current.reject();
    await rejected;
  });
  expect(handler).toHaveBeenCalledOnce();
});

it('cancels pending approvals when replacing the bridge and rejects retained old callbacks', async () => {
  const first = createHost(true);
  const second = createHost();

  const options: UseAssistantIntegrationOptions = {
    bridge: first.integration.assistantClient,
    commands: {},
  };

  const { result, rerender } = renderHook((props) => useAssistantIntegration(props), {
    initialProps: options,
  });

  const previousExecute = result.current.executeHostAction;
  let pending: Promise<unknown>;

  act(() => {
    pending = previousExecute('test.action', { value: 'old' });
  });

  const cancelled = expect(pending!).rejects.toMatchObject({ name: 'AbortError' });

  rerender({ ...options, bridge: second.integration.assistantClient });
  await cancelled;
  expect(result.current.confirmation).toBeUndefined();
  expect(first.handler).not.toHaveBeenCalled();
  await expect(previousExecute('test.action', { value: 'old' })).rejects.toMatchObject({
    code: 'RECEIVER_UNAVAILABLE',
  });
  await expect(result.current.executeHostAction('test.action', { value: 'new' })).resolves.toEqual({
    value: 'new',
  });
});

it('clears connection state and pending approval when the host disconnects', async () => {
  const { integration, handler } = createHost(true);

  const { result } = renderHook(() =>
    useAssistantIntegration({ bridge: integration.assistantClient, commands: {} }),
  );

  let pending: Promise<unknown>;

  act(() => {
    pending = result.current.executeHostAction('test.action', { value: 'old' });
  });

  const cancelled = expect(pending!).rejects.toBeDefined();

  await act(async () => {
    integration.dispose();
    await cancelled;
  });
  expect(result.current.isConnected).toBe(false);
  expect(result.current.bridge).toBeUndefined();
  expect(result.current.context).toBeUndefined();
  expect(result.current.confirmation).toBeUndefined();
  expect(handler).not.toHaveBeenCalled();
});

it('cancels an external transport approval on unmount and leaves the host alive', async () => {
  const { integration } = createHost();

  const { result, unmount } = renderHook(() =>
    useAssistantIntegration({ bridge: integration.assistantClient, commands: {} }),
  );

  const execute = result.current.executeHostAction;
  let pending: Promise<boolean>;

  act(() => {
    pending = result.current.requestConfirmation({ name: 'write', description: 'Write', args: {} });
  });

  const cancelled = expect(pending!).rejects.toBeDefined();

  unmount();
  await cancelled;
  await expect(execute('test.action', { value: 'late' })).rejects.toMatchObject({
    code: 'RECEIVER_UNAVAILABLE',
  });
  await expect(
    integration.assistantClient.requestHostAction('test.action', { value: 'alive' }),
  ).resolves.toEqual({
    value: 'alive',
  });
});

it('uses the latest custom approval callback without opening its built-in card', async () => {
  const { integration, handler } = createHost(true);
  const rejected = vi.fn(async () => false);
  const approved = vi.fn(async () => true);

  const options: UseAssistantIntegrationOptions = {
    bridge: integration.assistantClient,
    commands: {},
    actions: { requestConfirmation: rejected },
  };

  const { result, rerender } = renderHook((props) => useAssistantIntegration(props), {
    initialProps: options,
  });

  await expect(
    result.current.executeHostAction('test.action', { value: 'no' }),
  ).rejects.toMatchObject({
    code: 'ACTION_REJECTED',
  });
  rerender({ ...options, actions: { requestConfirmation: approved } });
  await result.current.executeHostAction('test.action', { value: 'yes' });
  expect(rejected).toHaveBeenCalledOnce();
  expect(approved).toHaveBeenCalledOnce();
  expect(handler).toHaveBeenCalledOnce();
  expect(result.current.confirmation).toBeUndefined();
});

it('connects an iframe with the same API and fresh command callbacks', async () => {
  const { integration } = createHost();
  const disconnect = vi.fn();

  vi.mocked(connectAssistantIframe).mockImplementation((options) => {
    options.onClient(integration.assistantClient);

    return disconnect;
  });

  const onSubmit = vi.fn();

  const options: UseAssistantIntegrationOptions = {
    iframe: { hostOrigin: 'https://host.example' },
    commands: { onSubmit },
  };

  const { result, rerender, unmount } = renderHook((props) => useAssistantIntegration(props), {
    initialProps: options,
  });

  await waitFor(() => expect(result.current.isConnected).toBe(true));

  const connection = vi.mocked(connectAssistantIframe).mock.calls[0]![0];
  const nextSubmit = vi.fn();

  rerender({ ...options, commands: { onSubmit: nextSubmit } });
  await connection.onCommand(request('assistant.submitPrompt', { prompt: 'from host' }));
  expect(nextSubmit).toHaveBeenCalledWith('from host', undefined);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(connectAssistantIframe).toHaveBeenCalledOnce();
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});

it('prefers a supplied bridge and supports disconnected standalone operation', async () => {
  const { integration } = createHost();

  const options: UseAssistantIntegrationOptions = {
    bridge: integration.assistantClient,
    iframe: { hostOrigin: 'https://host.example' },
    commands: {},
  };

  const { result, rerender } = renderHook((props) => useAssistantIntegration(props), {
    initialProps: options,
  });

  expect(connectAssistantIframe).not.toHaveBeenCalled();
  rerender({ commands: {}, iframe: { enabled: false } });
  expect(result.current.isConnected).toBe(false);
  await expect(result.current.executeHostAction('test.action', {})).rejects.toMatchObject({
    code: 'RECEIVER_UNAVAILABLE',
  });
});

it('routes open, close, focus and prefill through the existing chat functions', async () => {
  const { integration } = createHost();
  const connection = connectEmbeddedAssistant(integration, { onStatus: vi.fn() });

  const commands = {
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onFocus: vi.fn(),
    onPrefill: vi.fn(),
  };

  renderHook(() => useAssistantIntegration({ ...connection, commands }));
  await expect(integration.assistantCommands.open()).resolves.toEqual({ opened: true });
  await expect(integration.assistantCommands.close()).resolves.toEqual({ closed: true });
  await expect(integration.assistantCommands.focus()).resolves.toEqual({ focused: true });
  await expect(integration.assistantCommands.prefill('draft')).resolves.toEqual({
    prefilled: true,
  });
  expect(commands.onOpen).toHaveBeenCalledOnce();
  expect(commands.onClose).toHaveBeenCalledOnce();
  expect(commands.onFocus).toHaveBeenCalledOnce();
  expect(commands.onPrefill).toHaveBeenCalledExactlyOnceWith('draft');
  connection.dispose();
});

it('cancels an action waiting for the host on unmount without claiming to undo the handler', async () => {
  let finish: (value: unknown) => void = () => {};

  const handler = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );

  const integration = createHostIntegration({
    actions: [{ name: 'slow', description: 'Slow', schema: z.object({}), handler }],
  });

  integrations.push(integration);

  const { result, unmount } = renderHook(() =>
    useAssistantIntegration({
      bridge: integration.assistantClient,
      commands: {},
    }),
  );

  const pending = result.current.executeHostAction('slow', {});
  const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });

  await waitFor(() => expect(handler).toHaveBeenCalledOnce());
  unmount();
  await cancelled;
  finish({ done: true });
});
