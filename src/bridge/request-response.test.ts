import { describe, expect, it, vi } from 'vitest';

import { ERROR_CODES } from '@/contracts';
import { RequestResponseChannel } from './request-response';
import { TypedEventBus } from './typed-event-bus';

type Events = {
  req: { requestId: string; value: number };
  res: {
    requestId: string;
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  };
};

describe('RequestResponseChannel', () => {
  it('correlates request and response', async () => {
    const bus = new TypedEventBus<Events>();

    const channel = new RequestResponseChannel({
      bus,
      requestEvent: 'req',
      resultEvent: 'res',
      defaultTimeoutMs: 1000,
      extractRequestId: (r) => r.requestId,
      extractResult: (r) => ({
        requestId: r.requestId,
        success: r.success,
        data: r.data,
        error: r.error as import('../contracts/protocol').StructuredError | undefined,
      }),
    });

    bus.on('req', (r) => {
      bus.emit('res', { requestId: r.requestId, success: true, data: r.value * 2 });
    });

    const data = await channel.request({ requestId: 'abc-123', value: 21 });

    expect(data).toBe(42);
    channel.destroy();
  });

  it('times out unresolved requests', async () => {
    const bus = new TypedEventBus<Events>();

    const channel = new RequestResponseChannel({
      bus,
      requestEvent: 'req',
      resultEvent: 'res',
      defaultTimeoutMs: 50,
      extractRequestId: (r) => r.requestId,
      extractResult: (r) => ({
        requestId: r.requestId,
        success: r.success,
        data: r.data,
        error: r.error as import('../contracts/protocol').StructuredError | undefined,
      }),
    });

    await expect(channel.request({ requestId: 't1', value: 1 })).rejects.toMatchObject({
      code: ERROR_CODES.TIMEOUT,
    });
    channel.destroy();
  });

  it('ignores duplicate result settlement', () => {
    const bus = new TypedEventBus<Events>();

    const channel = new RequestResponseChannel({
      bus,
      requestEvent: 'req',
      resultEvent: 'res',
      defaultTimeoutMs: 1000,
      extractRequestId: (r) => r.requestId,
      extractResult: (r) => ({
        requestId: r.requestId,
        success: r.success,
        data: r.data,
        error: r.error as import('../contracts/protocol').StructuredError | undefined,
      }),
    });

    const resolve = vi.fn();

    channel['pending'].set('dup', {
      requestId: 'dup',
      resolve,
      reject: vi.fn(),
      timeoutId: setTimeout(() => {}, 10000),
      settled: false,
    });
    bus.emit('res', { requestId: 'dup', success: true, data: 1 });
    bus.emit('res', { requestId: 'dup', success: true, data: 2 });
    expect(resolve).toHaveBeenCalledTimes(1);
    channel.destroy();
  });
});
