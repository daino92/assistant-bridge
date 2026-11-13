import { createIntegrationError, normalizeIntegrationError } from '@/errors';
import { z } from 'zod';

import type { AssistantBridgeClient } from '@/assistant-client';
import {
  actionLifecycleEventSchema,
  type ActionLifecycleEvent,
  assistantCommandRequestSchema,
  assistantCommandResultSchema,
  hostActionRequestSchema,
  hostActionResultSchema,
  hostContextSchema,
  PROTOCOL_VERSION,
  ERROR_CODES,
  type AssistantCommandRequest,
  type HostContext,
} from '@/contracts';
import type { HostBridge } from '@/bridge';

const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('disconnect') }),
  z.object({ type: z.literal('context'), value: hostContextSchema }),
  z.object({ type: z.literal('action.lifecycle'), value: actionLifecycleEventSchema }),
  z.object({ type: z.literal('action.request'), value: hostActionRequestSchema }),
  z.object({ type: z.literal('action.result'), value: hostActionResultSchema }),
  z.object({ type: z.literal('command.request'), value: assistantCommandRequestSchema }),
  z.object({ type: z.literal('command.result'), value: assistantCommandResultSchema }),
]);

type PortMessage = z.infer<typeof messageSchema>;

type Result = z.infer<typeof hostActionResultSchema>;

const createPortChannel = (port: MessagePort, onMessage: (message: PortMessage) => void) => {
  let disposed = false;

  const pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const send = (message: PortMessage) => {
    if (!disposed) {
      port.postMessage(messageSchema.parse(message));
    }
  };

  port.onmessage = (event: MessageEvent<unknown>) => {
    const parsed = messageSchema.safeParse(event.data);

    if (!parsed.success) {
      return;
    }

    const message = parsed.data;

    if (message.type === 'disconnect') {
      dispose();
      onMessage(message);

      return;
    }

    if (message.type === 'action.result' || message.type === 'command.result') {
      const waiter = pending.get(message.value.requestId);

      if (!waiter) {
        return;
      }

      clearTimeout(waiter.timer);
      pending.delete(message.value.requestId);

      if (message.value.success) {
        waiter.resolve(message.value.data);
      } else {
        const detail = normalizeIntegrationError(message.value.error);

        waiter.reject(createIntegrationError(detail.code, detail.reason));
      }

      return;
    }

    onMessage(message);
  };

  port.start();

  const request = (message: PortMessage, requestId: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (disposed) {
        reject(createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE));

        return;
      }

      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(createIntegrationError(ERROR_CODES.TIMEOUT));
      }, 10_000);

      pending.set(requestId, { resolve, reject, timer });

      try {
        send(message);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(error);
      }
    });

  const dispose = () => {
    if (disposed) {
      return;
    }

    disposed = true;

    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE));
    }

    pending.clear();
    port.onmessage = null;
    port.close();
  };

  return { send, request, dispose };
};

const failure = (requestId: string, error: unknown): Result => {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    success: false,
    error: normalizeIntegrationError(error),
  };
};

/** Attach only after checking the iframe's exact source and origin. */
export const attachHostPort = (port: MessagePort, bridge: HostBridge) => {
  if (bridge.signal.aborted) {
    port.postMessage({ type: 'disconnect' });
    port.close();

    return () => {};
  }

  const channel = createPortChannel(port, (message) => {
    if (message.type === 'action.lifecycle') {
      bridge.publishActionLifecycle(message.value);

      return;
    }

    if (message.type !== 'action.request') {
      return;
    }

    const { requestId, action, payload, contextRevision, confirmed, actionExecutionId } =
      message.value;

    void bridge
      .requestHostAction(action, payload, contextRevision, confirmed, actionExecutionId)
      .then(
        (data) =>
          channel.send({
            type: 'action.result',
            value: { protocolVersion: PROTOCOL_VERSION, requestId, success: true, data },
          }),
        (error: unknown) =>
          channel.send({ type: 'action.result', value: failure(requestId, error) }),
      );
  });

  const unsubscribeLifecycle = bridge.bus.on('action.lifecycle', (event) =>
    channel.send({ type: 'action.lifecycle', value: event }),
  );

  const unsubscribeContext = bridge.bus.on('host.context.changed', ({ context }) =>
    channel.send({ type: 'context', value: context }),
  );

  const unsubscribeCommands = bridge.bus.on('assistant.command.request', (request) => {
    void channel.request({ type: 'command.request', value: request }, request.requestId).then(
      (data) =>
        bridge.bus.emit('assistant.command.result', {
          protocolVersion: PROTOCOL_VERSION,
          requestId: request.requestId,
          success: true,
          data,
        }),
      (error: unknown) =>
        bridge.bus.emit('assistant.command.result', failure(request.requestId, error)),
    );
  });

  let disposed = false;

  const dispose = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    bridge.signal.removeEventListener('abort', dispose);
    unsubscribeContext();
    unsubscribeLifecycle();
    unsubscribeCommands();

    try {
      channel.send({ type: 'disconnect' });
    } finally {
      channel.dispose();
    }
  };

  bridge.signal.addEventListener('abort', dispose, { once: true });

  return dispose;
};

export const createPortAssistantClient = (
  port: MessagePort,
  initialContext: HostContext,
  onCommand: (request: AssistantCommandRequest) => unknown | Promise<unknown>,
): { client: AssistantBridgeClient; dispose: () => void } => {
  const lifetime = new AbortController();
  let context = hostContextSchema.parse(structuredClone(initialContext));
  const subscribers = new Set<(context: HostContext) => void>();
  const lifecycleSubscribers = new Set<(event: ActionLifecycleEvent) => void>();

  const channel = createPortChannel(port, (message) => {
    if (message.type === 'disconnect') {
      lifetime.abort(createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE));
      subscribers.clear();
      lifecycleSubscribers.clear();

      return;
    }

    if (message.type === 'action.lifecycle') {
      lifecycleSubscribers.forEach((listener) => {
        try {
          listener(message.value);
        } catch {
          /* Observers cannot interrupt protocol handling. */
        }
      });

      return;
    }

    if (message.type === 'context') {
      context = message.value;
      subscribers.forEach((callback) => callback(structuredClone(context)));
    }

    if (message.type === 'command.request') {
      const { requestId } = message.value;

      void Promise.resolve()
        .then(() => onCommand(message.value))
        .then(
          (data) =>
            channel.send({
              type: 'command.result',
              value: { protocolVersion: PROTOCOL_VERSION, requestId, success: true, data },
            }),
          (error: unknown) =>
            channel.send({ type: 'command.result', value: failure(requestId, error) }),
        );
    }
  });

  return {
    client: {
      signal: lifetime.signal,
      publishActionLifecycle: (event) => channel.send({ type: 'action.lifecycle', value: event }),
      subscribeActionLifecycle: (listener) => {
        if (lifetime.signal.aborted) {
          return () => {};
        }

        lifecycleSubscribers.add(listener);

        return () => {
          lifecycleSubscribers.delete(listener);
        };
      },
      getContext: () => structuredClone(context),
      getInitialContext: () => structuredClone(context),
      subscribeContext: (callback) => {
        subscribers.add(callback);

        return () => {
          subscribers.delete(callback);
        };
      },
      requestHostAction: (action, payload, contextRevision, confirmed, actionExecutionId) => {
        const requestId = crypto.randomUUID();

        return channel.request(
          {
            type: 'action.request',
            value: {
              protocolVersion: PROTOCOL_VERSION,
              requestId,
              action,
              payload,
              contextRevision,
              ...(confirmed ? { confirmed: true } : {}),
              ...(actionExecutionId ? { actionExecutionId } : {}),
            },
          },
          requestId,
        );
      },
    },
    dispose: () => {
      lifetime.abort(createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE));
      subscribers.clear();
      lifecycleSubscribers.clear();
      channel.dispose();
    },
  };
};
