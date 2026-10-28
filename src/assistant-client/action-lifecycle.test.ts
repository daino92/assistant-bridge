import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  createActionConfirmationController,
  createAssistantActionExecutor,
} from '@/assistant-client';
import { createHostIntegration } from '@/create-host-integration';
import type { ActionLifecycleEvent } from '@/contracts';

const createHost = (requiresConfirmation = false, handler: () => unknown = () => ({ ok: true })) =>
  createHostIntegration({
    appId: 'test',
    actions: [
      {
        name: 'test.action',
        description: 'Test',
        schema: z.object({ private: z.string().optional() }),
        requiresConfirmation,
        handler,
      },
    ],
  });

it('shares one ID and ordered safe events between executor and host, including dispatch diagnostics', async () => {
  const timeline = vi.fn();

  const host = createHostIntegration({
    appId: 'test',
    onTimeline: timeline,
    actions: [
      {
        name: 'test.action',
        description: 'Test',
        schema: z.object({ private: z.string() }),
        handler: () => ({ secret: 'RESULT' }),
      },
    ],
  });

  const local: ActionLifecycleEvent[] = [];
  const received: ActionLifecycleEvent[] = [];

  host.subscribeActionLifecycle((event) => received.push(event));

  const executor = createAssistantActionExecutor(host.assistantClient, {
    onActionLifecycle: (event) => local.push(event),
  });

  await executor.executeAction('test.action', { private: 'SECRET' });
  expect(local.map((event) => event.status)).toEqual(['requested', 'running', 'succeeded']);
  expect(received).toEqual(local);
  expect(new Set(local.map((event) => event.actionExecutionId)).size).toBe(1);
  expect(local.map((event) => event.sequence)).toEqual([0, 1, 2]);
  expect(JSON.stringify(received)).not.toMatch(/SECRET|RESULT/);
  expect(
    timeline.mock.calls.some(
      ([entry]) => entry.requestId && entry.actionExecutionId === local[0].actionExecutionId,
    ),
  ).toBe(true);
  host.dispose();
});

it('pauses approval under the same ID and reports rejection without dispatch', async () => {
  const handler = vi.fn();
  const host = createHost(true, handler);
  const confirmation = createActionConfirmationController();
  const events: ActionLifecycleEvent[] = [];

  const executor = createAssistantActionExecutor(host.assistantClient, {
    requestConfirmation: confirmation.requestConfirmation,
    onActionLifecycle: (event) => events.push(event),
  });

  const promise = executor.executeAction('test.action', {});
  const rejection = expect(promise).rejects.toMatchObject({ code: 'ACTION_REJECTED' });

  expect(events.map((event) => event.status)).toEqual(['requested', 'awaiting-approval']);
  expect(confirmation.getSnapshot()?.actionExecutionId).toBe(events[0].actionExecutionId);
  confirmation.reject(confirmation.getSnapshot()!.id);
  await rejection;
  expect(events.map((event) => event.status)).toEqual([
    'requested',
    'awaiting-approval',
    'rejected',
  ]);
  expect(events.every((event) => !event.dispatched)).toBe(true);
  expect(handler).not.toHaveBeenCalled();
  confirmation.dispose();
  host.dispose();
});

it('cancels before dispatch even for legacy approval callbacks that ignore the signal', async () => {
  const handler = vi.fn();
  const host = createHost(true, handler);
  const abort = new AbortController();
  const events: ActionLifecycleEvent[] = [];
  let approve!: (value: boolean) => void;

  const executor = createAssistantActionExecutor(host.assistantClient, {
    signal: abort.signal,
    requestConfirmation: () =>
      new Promise((resolve) => {
        approve = resolve;
      }),
    onActionLifecycle: (event) => events.push(event),
  });

  const pending = executor.executeAction('test.action', {});
  const rejection = expect(pending).rejects.toThrow();

  abort.abort();
  await rejection;
  approve(true);
  await Promise.resolve();
  expect(events.map((event) => event.status)).toEqual([
    'requested',
    'awaiting-approval',
    'cancelled',
  ]);
  expect(events.at(-1)?.dispatched).toBe(false);
  expect(handler).not.toHaveBeenCalled();
  host.dispose();
});

it('marks cancellation after dispatch as uncertain and never emits a late success', async () => {
  let complete!: () => void;

  const host = createHost(
    false,
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );

  const abort = new AbortController();
  const events: ActionLifecycleEvent[] = [];

  const executor = createAssistantActionExecutor(host.assistantClient, {
    signal: abort.signal,
    onActionLifecycle: (event) => events.push(event),
  });

  const pending = executor.executeAction('test.action', {});
  const rejection = expect(pending).rejects.toThrow();

  abort.abort();
  await rejection;
  complete();
  await Promise.resolve();
  await Promise.resolve();
  expect(events.map((event) => event.status)).toEqual(['requested', 'running', 'cancelled']);
  expect(events.at(-1)?.dispatched).toBe(true);
  host.dispose();
});

it('isolates throwing observers and rejects duplicate or regressive wire events', async () => {
  const host = createHost();
  const received = vi.fn();

  host.subscribeActionLifecycle(received);

  const executor = createAssistantActionExecutor(host.assistantClient, {
    onActionLifecycle: () => {
      throw new Error('observer');
    },
  });

  await expect(executor.executeAction('test.action', {})).resolves.toEqual({ ok: true });

  const event = received.mock.calls.at(-1)![0] as ActionLifecycleEvent;

  host.bridge.publishActionLifecycle(event);
  host.bridge.publishActionLifecycle({ ...event, sequence: event.sequence + 1, status: 'running' });
  expect(received).toHaveBeenCalledTimes(3);
  host.dispose();
});
