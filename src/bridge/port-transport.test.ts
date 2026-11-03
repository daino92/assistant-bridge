// @vitest-environment node
import { MessageChannel } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { attachHostPort, createPortAssistantClient } from '@/bridge';
import { createHostIntegration } from '@/create-host-integration';
import { normalizeIntegrationError, createIntegrationError } from '@/errors';
import { createAssistantActionExecutor } from '@/assistant-client';
import type { ActionLifecycleEvent } from '@/contracts';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
});

const connect = () => {
  const handler = vi.fn(({ path }: { path: string }) => ({ path }));

  const integration = createHostIntegration({
    actions: [
      {
        name: 'ui.navigate',
        description: 'Navigate',
        schema: z.object({ path: z.string() }),
        handler,
      },
    ],
  });

  const ports = new MessageChannel();
  const detach = attachHostPort(ports.port1 as unknown as MessagePort, integration.bridge);
  const onCommand = vi.fn((request) => ({ command: request.command }));

  const remote = createPortAssistantClient(
    ports.port2 as unknown as MessagePort,
    integration.contextManager.getSnapshot(),
    onCommand,
  );

  integration.bridge.notifyAssistantReady('test');
  cleanups.push(() => integration.bridge.destroy(), detach, remote.dispose);

  return { ...integration, remote, handler, onCommand, ports };
};

describe('iframe port transport', () => {
  it('correlates concurrent actions and enforces host action schemas and allowlist', async () => {
    const { remote, handler } = connect();

    await expect(
      Promise.all([
        remote.client.requestHostAction('ui.navigate', { path: '/catalog' }),
        remote.client.requestHostAction('ui.navigate', { path: '/records' }),
      ]),
    ).resolves.toEqual([{ path: '/catalog' }, { path: '/records' }]);
    await expect(remote.client.requestHostAction('ui.navigate', { path: 42 })).rejects.toThrow();
    await expect(remote.client.requestHostAction('unknown', {})).rejects.toThrow();
    await expect(remote.client.requestHostAction('unknown', {})).rejects.toMatchObject({
      code: 'UNKNOWN_ACTION',
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });
  it('forwards context and host commands across the port', async () => {
    const { remote, contextManager, assistantCommands, onCommand } = connect();
    const context = vi.fn();

    remote.client.subscribeContext(context);
    contextManager.setRoute('/records', { title: 'Records', type: 'records' });
    await vi.waitFor(() => expect(context).toHaveBeenCalled());
    expect(remote.client.getInitialContext().route).toBe('/records');
    await expect(assistantCommands.prefill('Review records')).resolves.toEqual({
      command: 'assistant.prefill',
    });
    expect(onCommand.mock.calls[0][0].payload).toEqual({ text: 'Review records' });
  });
  it('ignores malformed envelopes and rejects pending requests on disposal', async () => {
    const { remote, ports, handler } = connect();

    ports.port2.postMessage({ type: 'action.request', value: { action: 'ui.navigate' } });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(handler).not.toHaveBeenCalled();

    const pending = remote.client.requestHostAction('ui.navigate', { path: '/' });

    remote.dispose();
    await expect(pending).rejects.toThrow('disconnected');
    await expect(remote.client.requestHostAction('ui.navigate', { path: '/' })).rejects.toThrow(
      'disconnected',
    );
  });
});

it.each(['STALE_CONTEXT', 'RESOURCE_NOT_FOUND', 'ACTION_REJECTED', 'PRIVATE_CODE'])(
  'returns the same safe action failure over direct and iframe clients: %s',
  async (code) => {
    const { actionRegistry, assistantClient, remote } = connect();

    actionRegistry.register({
      name: 'test.failure',
      description: 'Failure',
      parametersSchema: z.object({}),
      requiresConfirmation: false,
      handler: () => {
        throw { code, message: 'PRIVATE internal body', token: 'PRIVATE' };
      },
    });

    const expected = normalizeIntegrationError({ code });

    await expect(assistantClient.requestHostAction('test.failure', {})).rejects.toMatchObject(
      expected,
    );
    await expect(remote.client.requestHostAction('test.failure', {})).rejects.toMatchObject(
      expected,
    );
  },
);

it('normalizes iframe command errors without exposing receiver details', async () => {
  const { onCommand, assistantCommands } = connect();

  onCommand.mockImplementation(() => {
    throw { code: 'INVALID_PAYLOAD', message: 'PRIVATE receiver details' };
  });
  await expect(assistantCommands.open()).rejects.toMatchObject(
    normalizeIntegrationError({ code: 'INVALID_PAYLOAD' }),
  );
});

it('disconnects the iframe client and its pending requests when the integration is disposed', async () => {
  const { actionRegistry, dispose, remote } = connect();

  actionRegistry.register({
    name: 'pending',
    description: 'Pending',
    parametersSchema: z.object({}),
    requiresConfirmation: false,
    handler: () => new Promise(() => {}),
  });

  const pending = expect(remote.client.requestHostAction('pending', {})).rejects.toMatchObject({
    code: 'RECEIVER_UNAVAILABLE',
  });

  dispose();
  await pending;
  expect(remote.client.signal?.aborted).toBe(true);
  await expect(remote.client.requestHostAction('pending', {})).rejects.toMatchObject({
    code: 'RECEIVER_UNAVAILABLE',
  });
  remote.dispose();
});

it('forwards one correlated lifecycle between executor, host and iframe subscribers', async () => {
  const { remote, subscribeActionLifecycle, bridge } = connect();
  const hostEvents: ActionLifecycleEvent[] = [];
  const localEvents: ActionLifecycleEvent[] = [];
  const echoed: ActionLifecycleEvent[] = [];
  const requests = vi.fn();

  subscribeActionLifecycle((event) => hostEvents.push(event));
  remote.client.subscribeActionLifecycle!((event) => echoed.push(event));
  bridge.bus.on('host.action.request', requests);

  const executor = createAssistantActionExecutor(remote.client, {
    readiness: { 'ui.navigate': () => true },
    onActionLifecycle: (event) => localEvents.push(event),
  });

  await executor.executeAction('ui.navigate', { path: '/records' }, { toolCallId: 'tool-1' });
  await vi.waitFor(() => expect(echoed).toHaveLength(3));
  expect(hostEvents).toEqual(localEvents);
  expect(echoed).toEqual(localEvents);
  expect(hostEvents.map((event) => event.status)).toEqual(['requested', 'running', 'succeeded']);
  expect(hostEvents.every((event) => event.toolCallId === 'tool-1')).toBe(true);
  expect(requests.mock.calls[0][0].actionExecutionId).toBe(hostEvents[0].actionExecutionId);
});

it('isolates iframe context snapshots and each subscriber notification', async () => {
  const { remote, contextManager } = connect();
  const snapshot = remote.client.getInitialContext();

  snapshot.page.title = 'MUTATED';
  expect(remote.client.getInitialContext().page.title).not.toBe('MUTATED');
  remote.client.subscribeContext((context) => {
    context.page.title = 'MUTATED';
  });

  const listener = vi.fn();

  remote.client.subscribeContext(listener);
  contextManager.setRoute('/records', { title: 'Records', type: 'records' });
  await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
  expect(listener.mock.calls[0][0].page.title).toBe('Records');
  expect(remote.client.getInitialContext().page.title).toBe('Records');
});

it('preserves public business guidance through direct and iframe action results', async () => {
  const { actionRegistry, assistantClient, remote } = connect();
  const reason = { code: 'OFFER_REQUIRED', message: 'Select an offer before checkout.' };

  actionRegistry.register({
    name: 'test.blocked',
    description: 'Blocked',
    parametersSchema: z.object({}),
    requiresConfirmation: false,
    handler: () => {
      throw createIntegrationError('ACTION_NOT_AVAILABLE', reason);
    },
  });

  for (const client of [assistantClient, remote.client]) {
    await expect(client.requestHostAction('test.blocked', {})).rejects.toMatchObject({
      code: 'ACTION_NOT_AVAILABLE',
      message: reason.message,
      reason,
    });
  }
});
