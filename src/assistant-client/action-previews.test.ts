// @vitest-environment node
import { MessageChannel } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { attachHostPort, createPortAssistantClient } from '@/bridge';
import { createIntegration } from '@/create-host-integration';
import { createAssistantActionExecutor } from '@/assistant-client';
import type { HostActionInput } from '@/actions';

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

const setup = (overrides: Partial<HostActionInput<{ value: string }>> = {}, port = false) => {
  const handler = vi.fn(({ value }: { value: string }) => ({ saved: value }));

  const preview = vi.fn(({ value }: { value: string }) => ({
    title: `Save ${value}?`,
    details: ['Draft only'],
  }));

  const host = createIntegration({
    actions: [
      {
        name: 'record.save',
        description: 'Save record',
        schema: z.object({ value: z.string().min(1) }).strict(),
        requiresConfirmation: true,
        handler,
        preview,
        ...overrides,
      },
    ],
  });

  cleanups.push(() => host.dispose());

  let client = host.assistantClient;

  if (port) {
    const channel = new MessageChannel();

    cleanups.push(attachHostPort(channel.port1 as unknown as MessagePort, host.bridge));

    const remote = createPortAssistantClient(
      channel.port2 as unknown as MessagePort,
      client.getContext(),
      () => undefined,
    );

    cleanups.push(remote.dispose);
    client = remote.client;
  }

  return { host, client, handler, preview };
};

describe.each([false, true])('host-owned action previews (port=%s)', (port) => {
  it('validates and previews before approval, executes only after approval', async () => {
    const { client, handler, preview } = setup({}, port);

    const approve = vi.fn(async (request) => {
      expect(request.preview).toEqual({ title: 'Save hello?', details: ['Draft only'] });
      expect(preview).toHaveBeenCalledOnce();
      expect(handler).not.toHaveBeenCalled();

      return true;
    });

    const executor = createAssistantActionExecutor(client, { requestConfirmation: approve });

    await expect(executor.executeActionResult('record.save', { value: 'hello' })).resolves.toEqual({
      status: 'succeeded',
      data: { saved: 'hello' },
    });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('rejects invalid input before preview, approval or execution', async () => {
    const { client, handler, preview } = setup({}, port);
    const approve = vi.fn(async () => true);
    const executor = createAssistantActionExecutor(client, { requestConfirmation: approve });

    await expect(executor.executeActionResult('record.save', { value: 42 })).resolves.toMatchObject(
      { status: 'failed', error: { code: 'INVALID_PAYLOAD' } },
    );
    expect(preview).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('reports rejection without executing and preserves the throwing API', async () => {
    const { client, handler } = setup({}, port);

    const executor = createAssistantActionExecutor(client, {
      requestConfirmation: async () => false,
    });

    await expect(
      executor.executeActionResult('record.save', { value: 'hello' }),
    ).resolves.toMatchObject({ status: 'rejected', error: { code: 'ACTION_REJECTED' } });
    await expect(executor.executeAction('record.save', { value: 'hello' })).rejects.toMatchObject({
      code: 'ACTION_REJECTED',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('preserves safe business reasons and masks private preview failures', async () => {
    const { client, handler } = setup(
      {
        preview: () => {
          throw new Error('private-key-secret');
        },
      },
      port,
    );

    const executor = createAssistantActionExecutor(client, {
      requestConfirmation: async () => true,
    });

    const result = await executor.executeActionResult('record.save', { value: 'hello' });

    expect(result).toMatchObject({ status: 'failed', error: { code: 'EXECUTION_FAILED' } });
    expect(JSON.stringify(result)).not.toContain('private-key-secret');
    expect(handler).not.toHaveBeenCalled();

    const safe = setup(
      {
        exposeErrorMessages: true,
        preview: () => {
          throw new Error('Choose a record');
        },
      },
      port,
    );

    await expect(
      createAssistantActionExecutor(safe.client, {
        requestConfirmation: async () => true,
      }).executeActionResult('record.save', { value: 'hello' }),
    ).resolves.toMatchObject({
      status: 'failed',
      error: { reason: { message: 'Choose a record' } },
    });
  });

  it('cancels a pending preview without showing approval or executing', async () => {
    const entered = vi.fn();

    const { client, handler } = setup(
      {
        preview: () => {
          entered();

          return new Promise(() => {});
        },
      },
      port,
    );

    const controller = new AbortController();
    const approve = vi.fn(async () => true);

    const pending = createAssistantActionExecutor(client, {
      signal: controller.signal,
      requestConfirmation: approve,
    }).executeActionResult('record.save', { value: 'hello' });

    await vi.waitFor(() => expect(entered).toHaveBeenCalled());
    controller.abort();
    await expect(pending).resolves.toMatchObject({ status: 'cancelled' });
    expect(approve).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});

it('does not preview unavailable or unknown actions', async () => {
  const { host, preview, handler } = setup({ available: () => false });

  await expect(
    host.assistantClient.previewHostAction!('record.save', { value: 'hello' }),
  ).rejects.toMatchObject({ code: 'ACTION_NOT_AVAILABLE' });
  await expect(host.assistantClient.previewHostAction!('unknown', {})).rejects.toMatchObject({
    code: 'UNKNOWN_ACTION',
  });
  expect(preview).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
});

it('rejects a malformed preview instead of approving a write', async () => {
  const { client, handler } = setup({ preview: () => ({ title: '', details: [] }) });
  const approve = vi.fn(async () => true);

  await expect(
    createAssistantActionExecutor(client, { requestConfirmation: approve }).executeActionResult(
      'record.save',
      { value: 'hello' },
    ),
  ).resolves.toMatchObject({ status: 'failed', error: { code: 'INVALID_PAYLOAD' } });
  expect(approve).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
});

it('uses generic confirmation for an action without a preview', async () => {
  const { client, handler } = setup({ preview: undefined });

  const approve = vi.fn(async (request) => {
    expect(request.preview).toBeUndefined();

    return true;
  });

  await expect(
    createAssistantActionExecutor(client, { requestConfirmation: approve }).executeActionResult(
      'record.save',
      { value: 'hello' },
    ),
  ).resolves.toMatchObject({ status: 'succeeded' });
  expect(handler).toHaveBeenCalledOnce();
});

it('does not show stale approval after host context changes during a preview', async () => {
  let resolve!: (value: { title: string; details: string[] }) => void;

  const { client, host, handler } = setup({
    preview: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });

  const approve = vi.fn(async () => true);

  const pending = createAssistantActionExecutor(client, {
    requestConfirmation: approve,
  }).executeActionResult('record.save', { value: 'hello' });

  await vi.waitFor(() => expect(resolve).toBeDefined());
  host.updatePage({ route: '/other', page: { title: 'Other', type: 'other' } });
  resolve({ title: 'Save?', details: [] });
  await expect(pending).resolves.toMatchObject({
    status: 'failed',
    error: { code: 'STALE_CONTEXT' },
  });
  expect(approve).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
});

it('uses a generic approval with an older client that has no preview method', async () => {
  const { client, handler } = setup({ preview: undefined });
  const legacy = { ...client, previewHostAction: undefined };

  await expect(
    createAssistantActionExecutor(legacy, {
      requestConfirmation: async (request) => {
        expect(request.preview).toBeUndefined();

        return true;
      },
    }).executeActionResult('record.save', { value: 'hello' }),
  ).resolves.toMatchObject({ status: 'succeeded' });
  expect(handler).toHaveBeenCalledOnce();
});

it('rejects a pending preview when the host is disposed', async () => {
  const { client, host, handler } = setup({ preview: () => new Promise(() => {}) });
  const pending = client.previewHostAction!('record.save', { value: 'hello' });
  const rejected = expect(pending).rejects.toMatchObject({ code: 'RECEIVER_UNAVAILABLE' });

  host.dispose();
  await rejected;
  expect(handler).not.toHaveBeenCalled();
});

it('times out a read-only preview without calling the write handler', async () => {
  vi.useFakeTimers();

  const handler = vi.fn();

  const host = createIntegration({
    actionTimeoutMs: 5,
    actions: [
      {
        name: 'slow.preview',
        description: 'Slow',
        schema: z.object({}),
        preview: () => new Promise(() => {}),
        handler,
      },
    ],
  });

  cleanups.push(() => host.dispose());

  const rejected = expect(
    host.assistantClient.previewHostAction!('slow.preview', {}),
  ).rejects.toMatchObject({ code: 'TIMEOUT' });

  await vi.advanceTimersByTimeAsync(6);
  await rejected;
  expect(handler).not.toHaveBeenCalled();
});
