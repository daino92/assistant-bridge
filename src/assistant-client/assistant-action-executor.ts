import {
  defaultActionReadiness,
  waitForHostContext,
  type ActionReadiness,
  type AssistantBridgeClient,
  type WaitForHostContextOptions,
} from '@/assistant-client';
import {
  ERROR_CODES,
  type ActionLifecycleEvent,
  type ActionLifecycleListener,
  type ActionLifecycleStatus,
  type HostContext,
} from '@/contracts';
import { createIntegrationError, normalizeIntegrationError } from '@/errors';

export interface ActionConfirmation {
  entities?: HostContext['entities'];
  actionExecutionId?: string;
  name: string;
  description: string;
  args: unknown;
}

export interface ActionExecutionOptions {
  actionExecutionId?: string;
  toolCallId?: string;
  onActionLifecycle?: ActionLifecycleListener;
}

export interface AssistantActionExecutorOptions {
  onActionLifecycle?: ActionLifecycleListener;
  signal?: AbortSignal;
  readiness?: Readonly<Record<string, ActionReadiness>>;
  contextWait?: Omit<WaitForHostContextOptions, 'signal'>;
  requestConfirmation?: (request: ActionConfirmation, signal?: AbortSignal) => Promise<boolean>;
}

const awaitWithSignal = <T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) {
    return operation;
  }

  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));

    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));

    if (signal.aborted) {
      abort();
    }
  });
};

/** Executes host actions independently of the chat's agent protocol or transport. */
export const createAssistantActionExecutor = (
  bridge: AssistantBridgeClient,
  options: AssistantActionExecutorOptions = {},
) => {
  const signals = [options.signal, bridge.signal].filter((value): value is AbortSignal =>
    Boolean(value),
  );

  const signal = signals.length ? AbortSignal.any(signals) : undefined;

  return {
    executeAction: async (name: string, args: unknown, execution: ActionExecutionOptions = {}) => {
      const actionExecutionId = execution.actionExecutionId ?? crypto.randomUUID();
      let sequence = 0;
      let dispatched = false;
      let payloadSnapshot: unknown;

      const emit = (status: ActionLifecycleStatus, reason?: unknown) => {
        const event: ActionLifecycleEvent = {
          actionExecutionId,
          action: name,
          sequence: sequence++,
          status,
          timestamp: Date.now(),
          dispatched,
          ...(execution.toolCallId ? { toolCallId: execution.toolCallId } : {}),
          ...(reason !== undefined ? { error: normalizeIntegrationError(reason) } : {}),
        };

        // Observers cannot change execution state, arguments or error outcomes.
        try {
          bridge.publishActionLifecycle?.(structuredClone(event));
        } catch {
          /* Telemetry is best effort. */
        }

        for (const listener of [options.onActionLifecycle, execution.onActionLifecycle]) {
          try {
            listener?.(structuredClone(event), { args: structuredClone(payloadSnapshot) });
          } catch {
            /* Observer failures must not execute or reject actions. */
          }
        }
      };

      emit('requested');

      try {
        signal?.throwIfAborted();

        let latest = bridge.getInitialContext();

        if (!latest.capabilities.some((item) => item.name === name)) {
          throw createIntegrationError(ERROR_CODES.ACTION_NOT_AVAILABLE);
        }

        signal?.throwIfAborted();

        const capability = latest.capabilities.find((item) => item.name === name)!;

        payloadSnapshot = structuredClone(args);

        let confirmed = false;

        if (capability.requiresConfirmation) {
          if (!options.requestConfirmation) {
            throw createIntegrationError(ERROR_CODES.ACTION_NOT_AVAILABLE);
          }

          emit('awaiting-approval');
          signal?.throwIfAborted();

          confirmed = await awaitWithSignal(
            options.requestConfirmation(
              {
                actionExecutionId,
                name,
                description: capability.description,
                args: structuredClone(payloadSnapshot),
                ...(latest.entities ? { entities: structuredClone(latest.entities) } : {}),
              },
              signal,
            ),
            signal,
          );
          signal?.throwIfAborted();

          if (!confirmed) {
            throw createIntegrationError(ERROR_CODES.ACTION_REJECTED);
          }

          const fresh = bridge.getInitialContext();

          if (
            fresh.route !== latest.route ||
            !fresh.capabilities.some((item) => item.name === name)
          ) {
            throw createIntegrationError(ERROR_CODES.ACTION_NOT_AVAILABLE);
          }

          if (JSON.stringify(fresh.entities) !== JSON.stringify(latest.entities)) {
            throw createIntegrationError(ERROR_CODES.STALE_CONTEXT);
          }

          latest = fresh;
        }

        signal?.throwIfAborted();
        dispatched = true;
        emit('running');
        signal?.throwIfAborted();

        const result = await awaitWithSignal(
          bridge.requestHostAction(
            name,
            payloadSnapshot,
            latest.revision,
            confirmed || undefined,
            actionExecutionId,
          ),
          signal,
        );

        const ready = options.readiness?.[name] ?? defaultActionReadiness[name];

        await waitForHostContext(
          bridge,
          (context) =>
            ready?.({
              context,
              previousContext: latest,
              args: payloadSnapshot,
              result,
            }) ?? true,
          { ...options.contextWait, signal },
        );

        emit('succeeded');

        return result;
      } catch (error) {
        const detail = normalizeIntegrationError(error);

        emit(
          signal?.aborted
            ? 'cancelled'
            : detail.code === ERROR_CODES.ACTION_REJECTED
              ? 'rejected'
              : 'failed',
          signal?.aborted ? undefined : error,
        );

        throw error;
      }
    },
  };
};
