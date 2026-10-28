import type { ActionConfirmation } from '@/assistant-client';
import { ERROR_CODES } from '@/contracts';
import { createIntegrationError } from '@/errors';

export interface PendingActionConfirmation extends ActionConfirmation {
  id: string;
}

export interface ActionConfirmationController {
  getSnapshot: () => PendingActionConfirmation | undefined;
  subscribe: (listener: () => void) => () => void;
  requestConfirmation: (request: ActionConfirmation, signal?: AbortSignal) => Promise<boolean>;
  approve: (id: string) => void;
  reject: (id: string) => void;
  cancel: (reason?: unknown) => void;
  dispose: () => void;
}

/** Owns one pending confirmation independently of rendering or agent protocol. */
export const createActionConfirmationController = (): ActionConfirmationController => {
  let snapshot: PendingActionConfirmation | undefined;

  let pending:
    | { id: string; decide: (approved: boolean) => void; abort: (reason?: unknown) => void }
    | undefined;

  let disposed = false;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  const cancel = (reason?: unknown) => pending?.abort(reason);

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      if (disposed) {
        return () => {};
      }

      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    requestConfirmation: (request, signal) =>
      new Promise<boolean>((resolve, reject) => {
        signal?.throwIfAborted();

        if (disposed) {
          reject(createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE));

          return;
        }

        if (pending) {
          reject(createIntegrationError(ERROR_CODES.CONFIRMATION_REQUIRED));

          return;
        }

        const id = crypto.randomUUID();
        const requestSnapshot = { ...structuredClone(request), id };
        let settled = false;

        const cleanup = () => {
          signal?.removeEventListener('abort', onAbort);
          pending = undefined;
          snapshot = undefined;
        };

        const abort = (reason?: unknown) => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          reject(reason ?? new DOMException('Confirmation cancelled', 'AbortError'));
          notify();
        };

        const onAbort = () => abort(signal?.reason);

        const decide = (approved: boolean) => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          resolve(approved);
          notify();
        };

        pending = { id, decide, abort };
        snapshot = requestSnapshot;
        signal?.addEventListener('abort', onAbort, { once: true });
        notify();
      }),
    approve: (id) => {
      if (pending?.id === id) {
        pending.decide(true);
      }
    },
    reject: (id) => {
      if (pending?.id === id) {
        pending.decide(false);
      }
    },
    cancel,
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      cancel(createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE));
      listeners.clear();
    },
  };
};
