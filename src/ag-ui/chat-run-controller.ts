import {
  createHostAgentOptions,
  normalizeRunError,
  RUN_ERROR_CODES,
  type RunError,
  runWebSocketAgent,
  type AgentOptions,
  type RunAgentInput,
} from '@/ag-ui';
import type { AssistantActionExecutorOptions, AssistantBridgeClient } from '@/assistant-client';

export type ChatRunResult =
  | { status: 'completed'; threadId: string; runId: string }
  | { status: 'stopped'; threadId: string; runId: string }
  | { status: 'failed'; threadId: string; runId: string; error: RunError };

export type ChatRunState = Readonly<
  { status: 'idle' } | { status: 'running'; threadId: string; runId: string } | ChatRunResult
>;

export type ChatRunControllerOptions = Pick<AgentOptions, 'url' | 'transport' | 'timeoutMs'>;

export interface ChatRunStartOptions
  extends
    Pick<AgentOptions, 'onText' | 'onActivity' | 'onActionLifecycle' | 'onToolActivity'>,
    Pick<AssistantActionExecutorOptions, 'requestConfirmation' | 'readiness' | 'contextWait'> {
  threadId: string;
  messages: RunAgentInput['messages'];
  context?: RunAgentInput['context'];
  bridge?: AssistantBridgeClient;
  signal?: AbortSignal;
  state?: RunAgentInput['state'];
  forwardedProps?: RunAgentInput['forwardedProps'];
}

export interface ChatRunController {
  getSnapshot: () => ChatRunState;
  subscribe: (listener: () => void) => () => void;
  start: (options: ChatRunStartOptions) => Promise<ChatRunResult>;
  stop: () => void;
  dispose: () => void;
}

const waitForRun = (operation: Promise<void>, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(signal.reason ?? new DOMException('Run stopped', 'AbortError'));
    };

    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      () => {
        signal.removeEventListener('abort', abort);
        resolve();
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );

    if (signal.aborted) {
      abort();
    }
  });

/** One reusable run owner; presentation and message storage belong to the consuming chat. */
export const createChatRunController = (options: ChatRunControllerOptions): ChatRunController => {
  const configuration = { ...options, transport: options.transport ?? 'websocket' };
  let snapshot: ChatRunState = Object.freeze({ status: 'idle' });
  let active: { controller: AbortController; runId: string } | undefined;
  let disposed = false;
  const listeners = new Set<() => void>();

  const publish = (value: ChatRunState) => {
    snapshot = Object.freeze({ ...value });

    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* State observers must not change run outcomes. */
      }
    }
  };

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
    start: (request) => {
      if (disposed) {
        throw new Error('The chat run controller has been disposed.');
      }

      if (active) {
        throw new Error('A chat run is already active. Stop it before starting another.');
      }

      const startOptions = { ...request };
      const controller = new AbortController();
      const run = { controller, runId: crypto.randomUUID() };
      const identity = { runId: run.runId, threadId: startOptions.threadId };

      const signal = AbortSignal.any(
        [controller.signal, startOptions.signal, startOptions.bridge?.signal].filter(
          (value): value is AbortSignal => Boolean(value),
        ),
      );

      const isCurrent = () => active === run && !disposed;

      active = run;
      publish({ ...identity, status: 'running' });

      const execute = async (): Promise<ChatRunResult> => {
        let result: ChatRunResult;

        try {
          signal.throwIfAborted();

          const host = createHostAgentOptions(startOptions.bridge, {
            signal,
            requestConfirmation: startOptions.requestConfirmation,
            readiness: startOptions.readiness,
            contextWait: startOptions.contextWait,
          });

          await waitForRun(
            runWebSocketAgent({
              ...configuration,
              input: {
                ...identity,
                messages: structuredClone(startOptions.messages),
                tools: host.tools,
                context: [...host.context, ...structuredClone(startOptions.context ?? [])],
                state: structuredClone(startOptions.state ?? {}),
                forwardedProps: structuredClone(startOptions.forwardedProps ?? {}),
              },
              signal,
              executeTool: host.executeTool,
              getHostState: host.getHostState,
              onText: (text) => {
                if (isCurrent() && !signal.aborted) {
                  startOptions.onText(text);
                }
              },
              onActivity: (activity) => {
                if (isCurrent() && !signal.aborted) {
                  startOptions.onActivity?.(activity);
                }
              },
              onToolActivity: (activity) => {
                if (isCurrent() && !signal.aborted) {
                  startOptions.onToolActivity?.(activity);
                }
              },
              onActionLifecycle: (event, details) => {
                if (isCurrent() && (!signal.aborted || event.status === 'cancelled')) {
                  startOptions.onActionLifecycle?.(event, details);
                }
              },
            }),
            signal,
          );
          signal.throwIfAborted();
          result = { ...identity, status: 'completed' };
        } catch (error) {
          const detail = normalizeRunError(error);

          result =
            signal.aborted || detail.code === RUN_ERROR_CODES.STOPPED
              ? { ...identity, status: 'stopped' }
              : { ...identity, status: 'failed', error: detail };
        } finally {
          // Also stops pending host work when the server ends the run with an error.
          controller.abort();
          await Promise.resolve();
        }

        if (active === run) {
          active = undefined;
          publish(result);
        }

        return result;
      };

      return execute();
    },
    stop: () => active?.controller.abort(),
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      active?.controller.abort();
      listeners.clear();
    },
  };
};
