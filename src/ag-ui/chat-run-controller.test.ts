import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  createChatRunController,
  normalizeRunError,
  type AgentOptions,
  type ChatRunController,
} from '@/ag-ui';
import { createActionConfirmationController } from '@/assistant-client';
import { createHostIntegration } from '@/create-host-integration';

const runAgent = vi.hoisted(() => vi.fn());

vi.mock('./run-websocket-agent.js', () => ({ runWebSocketAgent: runAgent }));

const controllers: ChatRunController[] = [];

const createController = () => {
  const controller = createChatRunController({
    url: 'ws://test/agent',
    transport: 'stomp',
    timeoutMs: 1000,
  });

  controllers.push(controller);

  return controller;
};

const START = {
  threadId: 'thread',
  messages: [{ id: 'user', role: 'user' as const, content: 'Hello' }],
  onText: vi.fn(),
};

beforeEach(() => {
  runAgent.mockReset();
  START.onText.mockReset();
});
afterEach(() => controllers.splice(0).forEach((controller) => controller.dispose()));

it('creates distinct run IDs, owns busy state and preserves the caller thread and input snapshot', async () => {
  const input = structuredClone(START.messages);
  const calls: AgentOptions[] = [];
  let finish!: () => void;

  runAgent.mockImplementation((options: AgentOptions) => {
    calls.push(options);

    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });

  const controller = createController();
  const listener = vi.fn();
  const unsubscribe = controller.subscribe(listener);
  const first = controller.start({ ...START, messages: input });

  input[0].content = 'MUTATED';
  expect(controller.getSnapshot().status).toBe('running');
  expect(() => controller.start(START)).toThrow('already active');
  expect(calls[0].input.messages[0].content).toBe('Hello');
  expect(calls[0].transport).toBe('stomp');
  expect(calls[0].input.tools).toEqual([]);
  calls[0].onText('Reply');
  expect(START.onText).toHaveBeenCalledWith('Reply');
  finish();

  const result = await first;

  expect(result.status).toBe('completed');
  expect(result.threadId).toBe('thread');
  expect(calls[0].signal.aborted).toBe(true);
  expect(controller.getSnapshot()).toEqual(result);
  expect(listener).toHaveBeenCalledTimes(2);

  const second = controller.start(START);

  finish();
  expect((await second).runId).not.toBe(result.runId);
  unsubscribe();
});

it('stops promptly and ignores late callbacks and completion from a previous run', async () => {
  const calls: AgentOptions[] = [];
  const finish: Array<() => void> = [];

  runAgent.mockImplementation((options: AgentOptions) => {
    calls.push(options);

    return new Promise<void>((resolve) => {
      finish.push(resolve);
    });
  });

  const controller = createController();
  const first = controller.start(START);

  controller.stop();

  const stopped = await first;

  expect(stopped.status).toBe('stopped');

  const secondText = vi.fn();
  const second = controller.start({ ...START, onText: secondText });

  calls[0].onText('STALE');
  finish[0]();
  await Promise.resolve();
  expect(START.onText).not.toHaveBeenCalled();
  expect(controller.getSnapshot().status).toBe('running');
  calls[1].onText('Current');
  finish[1]();
  expect((await second).status).toBe('completed');
  expect(secondText).toHaveBeenCalledExactlyOnceWith('Current');
});

it('returns failures without classifying cleanup abort as a user stop', async () => {
  const failure = Object.assign(new Error('Safe provider failure'), { code: 'RATE_LIMITED' });
  let signal!: AbortSignal;

  runAgent.mockImplementation((options: AgentOptions) => {
    signal = options.signal;

    return Promise.reject(failure);
  });

  const controller = createController();

  await expect(controller.start(START)).resolves.toMatchObject({
    status: 'failed',
    error: normalizeRunError(failure),
  });
  expect(signal.aborted).toBe(true);
  runAgent.mockResolvedValue(undefined);
  await expect(controller.start(START)).resolves.toMatchObject({ status: 'completed' });
});

it('automatically binds host tools and cancels a pending confirmation when the host disconnects', async () => {
  const host = createHostIntegration({
    appId: 'test',
    actions: [
      {
        name: 'test.delete',
        description: 'Delete',
        schema: z.object({}),
        requiresConfirmation: true,
        handler: vi.fn(),
      },
    ],
  });

  const confirmations = createActionConfirmationController();
  const lifecycle = vi.fn();

  runAgent.mockImplementation(async (options: AgentOptions) => {
    expect(options.input.tools[0].name).toBe('test.delete');
    expect(options.input.context).toHaveLength(1);

    await options.executeTool!('test.delete', {}, { onActionLifecycle: options.onActionLifecycle });
  });

  const controller = createController();

  const pending = controller.start({
    ...START,
    bridge: host.assistantClient,
    requestConfirmation: confirmations.requestConfirmation,
    onActionLifecycle: lifecycle,
  });

  expect(confirmations.getSnapshot()).toBeDefined();
  host.dispose();
  await expect(pending).resolves.toMatchObject({ status: 'stopped' });
  expect(confirmations.getSnapshot()).toBeUndefined();
  expect(lifecycle.mock.calls.map(([event]) => event.status)).toEqual([
    'requested',
    'awaiting-approval',
    'cancelled',
  ]);
  confirmations.dispose();
});

it('does not connect for an already-aborted caller signal and disposes idempotently', async () => {
  const abort = new AbortController();
  const controller = createController();

  abort.abort();
  await expect(controller.start({ ...START, signal: abort.signal })).resolves.toMatchObject({
    status: 'stopped',
  });
  expect(runAgent).not.toHaveBeenCalled();
  controller.dispose();
  controller.dispose();
  expect(() => controller.start(START)).toThrow('disposed');
});

it('finishes a disposed run without notifying removed observers or accepting late text', async () => {
  let options!: AgentOptions;

  runAgent.mockImplementation((value: AgentOptions) => {
    options = value;

    return new Promise(() => {});
  });

  const controller = createController();
  const listener = vi.fn();

  controller.subscribe(listener);

  const pending = controller.start(START);

  controller.dispose();
  await expect(pending).resolves.toMatchObject({ status: 'stopped' });
  options.onText('Late');
  expect(START.onText).not.toHaveBeenCalled();
  expect(listener).toHaveBeenCalledOnce();
});

it('delivers post-dispatch cancellation before finalizing the run without claiming rollback', async () => {
  const host = createHostIntegration({
    appId: 'test',
    actions: [
      {
        name: 'test.pending',
        description: 'Pending',
        schema: z.object({}),
        handler: () => new Promise(() => {}),
      },
    ],
  });

  const lifecycle = vi.fn();

  runAgent.mockImplementation(async (options: AgentOptions) => {
    await options.executeTool!(
      'test.pending',
      {},
      { onActionLifecycle: options.onActionLifecycle },
    );
  });

  const controller = createController();

  const pending = controller.start({
    ...START,
    bridge: host.assistantClient,
    onActionLifecycle: lifecycle,
  });

  controller.stop();
  await expect(pending).resolves.toMatchObject({ status: 'stopped' });
  expect(lifecycle.mock.calls.map(([event]) => event.status)).toEqual([
    'requested',
    'running',
    'cancelled',
  ]);
  expect(lifecycle.mock.calls.at(-1)![0].dispatched).toBe(true);
  host.dispose();
});

it('defaults to websocket when transport is omitted', async () => {
  runAgent.mockResolvedValue(undefined);

  const controller = createChatRunController({ url: 'ws://test/agent' });

  controllers.push(controller);
  await expect(controller.start(START)).resolves.toMatchObject({ status: 'completed' });
  expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({ transport: 'websocket' }));
});

it('treats a typed server STOPPED outcome as stopped rather than failed', async () => {
  runAgent.mockRejectedValue({ code: 'STOPPED', message: 'PRIVATE' });

  const controller = createController();

  await expect(controller.start(START)).resolves.toMatchObject({ status: 'stopped' });
});
