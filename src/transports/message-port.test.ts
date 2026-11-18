// @vitest-environment node
import { MessageChannel } from 'node:worker_threads';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { connectAssistantPort, connectHostPort } from './message-port';

import { createHostIntegration } from '@/create-host-integration';
import type { AssistantBridgeClient } from '@/assistant-client';
import { PROTOCOL_VERSION } from '@/contracts';
import { answer } from '../../test/command-answers';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
});

const setup = () => {
  const handler = vi.fn(({ value }: { value: string }) => ({ value }));

  const integration = createHostIntegration({
    actions: [
      {
        name: 'test.action',
        description: 'Test',
        schema: z.object({ value: z.string() }),
        handler,
      },
    ],
  });

  const channel = new MessageChannel();
  const onStatus = vi.fn();

  const host = connectHostPort(integration, {
    port: channel.port1 as unknown as MessagePort,
    onStatus,
    timeoutMs: 100,
  });

  cleanups.push(integration.dispose, host.dispose, () => channel.port2.close());

  return { integration, host, handler, onStatus, port: channel.port2 as unknown as MessagePort };
};

it('connects over a supplied channel with fresh context, commands and validated actions', async () => {
  const { integration, port, onStatus, handler } = setup();
  let client: AssistantBridgeClient | undefined;
  const onCommand = vi.fn(answer);

  const chat = connectAssistantPort({
    port,
    onCommand,
    onClient: (next) => {
      client = next;
    },
  });

  cleanups.push(chat.dispose);
  await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith('ready'));
  expect(client).toBeDefined();
  await expect(integration.assistantCommands.open()).resolves.toEqual({ opened: true });
  expect(onCommand).toHaveBeenCalledOnce();
  await expect(client!.requestHostAction('test.action', { value: 'ok' })).resolves.toEqual({
    value: 'ok',
  });
  await expect(client!.requestHostAction('test.action', { value: 42 })).rejects.toMatchObject({
    code: 'INVALID_PAYLOAD',
  });
  expect(handler).toHaveBeenCalledOnce();
  integration.updatePage({ route: '/next', page: { title: 'Next', type: 'next' } });
  await vi.waitFor(() => expect(client!.getContext().route).toBe('/next'));

  const previous = client;

  integration.dispose();
  await vi.waitFor(() => expect(client).toBeUndefined());
  expect(previous!.signal!.aborted).toBe(true);
});

it('waits for acknowledgement and refuses an incompatible peer', async () => {
  const { integration, port, onStatus } = setup();

  port.postMessage({ type: 'transport.connected', protocolVersion: PROTOCOL_VERSION });
  port.postMessage({ type: 'transport.ready', protocolVersion: '999.0.0' });
  await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith('error'));
  await expect(integration.assistantCommands.open()).rejects.toMatchObject({
    code: 'RECEIVER_UNAVAILABLE',
  });
});

it('times out a silent channel and ignores late readiness', async () => {
  const { host, port, onStatus } = setup();

  await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith('error'));
  port.postMessage({ type: 'transport.ready', protocolVersion: PROTOCOL_VERSION });
  expect(host.isActive()).toBe(false);
});

it('makes the host unavailable when the chat disconnects', async () => {
  const { integration, port, onStatus } = setup();
  const chat = connectAssistantPort({ port, onCommand: answer, onClient: vi.fn() });

  cleanups.push(chat.dispose);
  await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith('ready'));
  chat.dispose();
  await vi.waitFor(async () => {
    await expect(integration.assistantCommands.open()).rejects.toMatchObject({
      code: 'RECEIVER_UNAVAILABLE',
    });
  });
});

it('rejects invalid initial context without exposing a client', async () => {
  const channel = new MessageChannel();
  const onClient = vi.fn();

  const chat = connectAssistantPort({
    port: channel.port2 as unknown as MessagePort,
    onCommand: answer,
    onClient,
  });

  cleanups.push(() => channel.port1.close(), chat.dispose);
  channel.port1.postMessage({
    type: 'transport.context',
    protocolVersion: PROTOCOL_VERSION,
    context: {},
  });
  await vi.waitFor(() => expect(onClient).toHaveBeenCalledExactlyOnceWith(undefined));
});
