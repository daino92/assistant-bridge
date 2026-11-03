import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  createAssistantActionExecutor,
  createAssistantCommandDispatcher,
  type AssistantActionExecutorOptions,
  type AssistantCommandCallbacks,
  type ActionExecutionOptions,
  type EmbeddedAssistantOptions,
  type AssistantBridgeClient,
} from '@/assistant-client';
import { ERROR_CODES } from '@/contracts';
import { createIntegrationError } from '@/errors';
import {
  useActionConfirmation,
  useAssistantCommandHandler,
  useAssistantContext,
  useAssistantIframeConnection,
} from '@/react/hooks';

export interface UseAssistantIntegrationOptions extends Partial<EmbeddedAssistantOptions> {
  commands: AssistantCommandCallbacks;
  iframe?: {
    enabled?: boolean;
    hostOrigin?: string;
  };
  actions?: AssistantActionExecutorOptions;
}

interface ActionConnection {
  client: AssistantBridgeClient;
  controller: AbortController;
}

const getServerSnapshot = () => false;

/** Adapts an existing chat without owning its UI, messages or backend protocol. */
export const useAssistantIntegration = ({
  bridge,
  onReady,
  commands,
  iframe,
  actions,
}: UseAssistantIntegrationOptions) => {
  const [iframeClient, setIframeClient] = useState<AssistantBridgeClient>();
  const client = bridge ?? iframeClient;
  const approval = useActionConfirmation();
  const context = useAssistantContext(client);
  const actionConnection = useRef<ActionConnection | null>(null);
  const actionOptions = useRef(actions);

  const onCommand = useMemo(() => createAssistantCommandDispatcher(commands), [commands]);

  const subscribeConnection = useCallback(
    (notify: () => void) => {
      client?.signal?.addEventListener('abort', notify);

      return () => client?.signal?.removeEventListener('abort', notify);
    },
    [client],
  );

  const getSnapshot = useCallback(() => Boolean(client && !client.signal?.aborted), [client]);

  const isConnected = useSyncExternalStore(subscribeConnection, getSnapshot, getServerSnapshot);

  useLayoutEffect(() => {
    actionOptions.current = actions;
  }, [actions]);

  useLayoutEffect(() => {
    if (!client) {
      return;
    }

    const connection = { client, controller: new AbortController() };

    actionConnection.current = connection;

    return () => {
      connection.controller.abort();
      actionConnection.current = null;
    };
  }, [client]);

  useAssistantIframeConnection({
    enabled: !bridge && (iframe?.enabled ?? true),
    hostOrigin: iframe?.hostOrigin,
    onClient: setIframeClient,
    onCommand,
  });

  useAssistantCommandHandler(onCommand, isConnected ? onReady : undefined);

  const requestConfirmation = useCallback<
    NonNullable<AssistantActionExecutorOptions['requestConfirmation']>
  >(
    (request, signal) => {
      const connection = actionConnection.current;

      if (!connection || connection.client !== client) {
        return Promise.reject(createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE));
      }

      const options = actionOptions.current;

      const signals = [
        signal,
        options?.signal,
        client?.signal,
        connection.controller.signal,
      ].filter((value): value is AbortSignal => Boolean(value));

      return (options?.requestConfirmation ?? approval.requestConfirmation)(
        request,
        AbortSignal.any(signals),
      );
    },
    [client, approval.requestConfirmation],
  );

  const executeHostAction = useCallback(
    async (name: string, payload: unknown, execution?: ActionExecutionOptions) => {
      const connection = actionConnection.current;

      if (!connection || connection.client !== client || !client) {
        throw createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE);
      }

      const options = actionOptions.current;

      const signals = [connection.controller.signal, options?.signal].filter(
        (value): value is AbortSignal => Boolean(value),
      );

      const executor = createAssistantActionExecutor(client, {
        ...options,
        signal: AbortSignal.any(signals),
        requestConfirmation,
      });

      return executor.executeAction(name, payload, execution);
    },
    [client, requestConfirmation],
  );

  return {
    bridge: isConnected ? client : undefined,
    context: isConnected ? context : undefined,
    isConnected,
    executeHostAction,
    requestConfirmation,
    confirmation: approval.confirmation,
    approve: approval.approve,
    reject: approval.reject,
  };
};
