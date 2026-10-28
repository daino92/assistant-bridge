import type { AssistantBridgeClient } from '@/assistant-client';
import { ERROR_CODES, type HostContext } from '@/contracts';
import { createIntegrationError } from '@/errors';

export interface WaitForHostContextOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  settleMs?: number;
}

/** Waits for a predicate and a quiet context window, releasing resources on every exit path. */
export const waitForHostContext = (
  bridge: AssistantBridgeClient,
  ready: (context: HostContext) => boolean,
  { signal: requestedSignal, timeoutMs = 3000, settleMs = 50 }: WaitForHostContextOptions = {},
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const signals = [requestedSignal, bridge.signal].filter((value): value is AbortSignal =>
      Boolean(value),
    );

    const signal = signals.length ? AbortSignal.any(signals) : undefined;

    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Host context update aborted.'));

      return;
    }

    let settled = false;
    let settle: ReturnType<typeof setTimeout> | undefined;

    let unsubscribe = () => {};

    const finish = (error?: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      clearTimeout(settle);
      unsubscribe();
      signal?.removeEventListener('abort', abort);

      if (error !== undefined) {
        reject(error);
      } else {
        resolve();
      }
    };

    const abort = () => finish(signal?.reason ?? new Error('Host context update aborted.'));

    const timeout = setTimeout(
      () => finish(createIntegrationError(ERROR_CODES.TIMEOUT)),
      timeoutMs,
    );

    const check = (context: HostContext) => {
      if (settled) {
        return;
      }

      clearTimeout(settle);

      try {
        if (ready(context)) {
          settle = setTimeout(() => finish(), settleMs);
        }
      } catch (error) {
        finish(error ?? new Error('Host readiness check failed.'));
      }
    };

    signal?.addEventListener('abort', abort, { once: true });

    try {
      unsubscribe = bridge.subscribeContext(check);

      if (settled) {
        unsubscribe();
      } else if (signal?.aborted) {
        abort();
      } else {
        check(bridge.getInitialContext());
      }
    } catch (error) {
      finish(error ?? new Error('Host context subscription failed.'));
    }
  });
