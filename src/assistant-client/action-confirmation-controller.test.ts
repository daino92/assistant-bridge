import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  createActionConfirmationController,
  createAssistantActionExecutor,
} from '@/assistant-client';
import { createHostIntegration } from '@/create-host-integration';

const REQUEST = { name: 'records.delete', description: 'Delete', args: { recordId: 'one' } };

it('publishes a snapshotted request and settles approve/reject exactly once', async () => {
  const controller = createActionConfirmationController();
  const listener = vi.fn();
  const unsubscribe = controller.subscribe(listener);
  const request = structuredClone(REQUEST);
  const first = controller.requestConfirmation(request);

  request.args.recordId = 'changed';

  const snapshot = controller.getSnapshot()!;

  expect(snapshot.args).toEqual({ recordId: 'one' });
  controller.approve(snapshot.id);
  controller.reject(snapshot.id);
  await expect(first).resolves.toBe(true);
  expect(controller.getSnapshot()).toBeUndefined();
  expect(listener).toHaveBeenCalledTimes(2);

  const second = controller.requestConfirmation(REQUEST);
  const next = controller.getSnapshot()!;

  controller.approve(snapshot.id);
  expect(controller.getSnapshot()).toBe(next);
  controller.reject(next.id);
  await expect(second).resolves.toBe(false);
  unsubscribe();
  controller.dispose();
});

it('rejects overlapping requests without replacing the current confirmation', async () => {
  const controller = createActionConfirmationController();
  const first = controller.requestConfirmation(REQUEST);
  const snapshot = controller.getSnapshot();

  await expect(controller.requestConfirmation(REQUEST)).rejects.toMatchObject({
    code: 'CONFIRMATION_REQUIRED',
  });
  expect(controller.getSnapshot()).toBe(snapshot);
  controller.approve(snapshot!.id);
  await first;
  controller.dispose();
});

it('cancels promptly, releases its abort listener and ignores late decisions', async () => {
  const controller = createActionConfirmationController();
  const abort = new AbortController();
  const remove = vi.spyOn(abort.signal, 'removeEventListener');
  const promise = controller.requestConfirmation(REQUEST, abort.signal);
  const snapshot = controller.getSnapshot()!;
  const rejected = expect(promise).rejects.toThrow();

  abort.abort();
  await rejected;
  expect(controller.getSnapshot()).toBeUndefined();
  expect(remove).toHaveBeenCalledOnce();
  controller.approve(snapshot.id);
  await expect(controller.requestConfirmation(REQUEST, abort.signal)).rejects.toThrow();
  expect(controller.getSnapshot()).toBeUndefined();
  controller.dispose();
});

it('disposes pending work idempotently and refuses future requests', async () => {
  const controller = createActionConfirmationController();
  const listener = vi.fn();

  controller.subscribe(listener);

  const promise = controller.requestConfirmation(REQUEST);
  const rejected = expect(promise).rejects.toMatchObject({ code: 'RECEIVER_UNAVAILABLE' });

  controller.dispose();
  controller.dispose();
  await rejected;
  await expect(controller.requestConfirmation(REQUEST)).rejects.toMatchObject({
    code: 'RECEIVER_UNAVAILABLE',
  });
  expect(controller.getSnapshot()).toBeUndefined();
  expect(listener).toHaveBeenCalledTimes(2);
});

it.each(['stop', 'dispose'])(
  'propagates %s to a pending executor confirmation without dispatch',
  async (operation) => {
    const dispatch = vi.fn();

    const integration = createHostIntegration({
      actions: [
        {
          name: REQUEST.name,
          description: 'Delete',
          schema: z.object({ recordId: z.string() }),
          requiresConfirmation: true,
          handler: dispatch,
        },
      ],
    });

    const controller = createActionConfirmationController();
    const stop = new AbortController();

    const executor = createAssistantActionExecutor(integration.assistantClient, {
      signal: stop.signal,
      requestConfirmation: controller.requestConfirmation,
    });

    const pending = executor.executeAction(REQUEST.name, REQUEST.args);
    const rejected = expect(pending).rejects.toThrow();

    expect(controller.getSnapshot()).toBeDefined();

    if (operation === 'stop') {
      stop.abort();
    } else {
      integration.dispose();
    }

    await rejected;
    expect(controller.getSnapshot()).toBeUndefined();
    expect(dispatch).not.toHaveBeenCalled();
    controller.dispose();
    integration.dispose();
  },
);
