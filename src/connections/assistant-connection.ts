import { createIntegrationError } from '@/errors';
import { attachAssistantCommandHandler, type EmbeddedAssistantOptions } from '@/assistant-client';
import type { HostBridge } from '@/bridge';
import type { HostIntegration } from '@/create-host-integration';
import { ERROR_CODES, type IntegrationDiagnostic } from '@/contracts';

export type AssistantConnectionStatus = 'loading' | 'ready' | 'error';

export interface AssistantConnectionOptions {
  /** Optional; same-window hosts that do not show connection state can omit it. */
  onStatus?: (status: AssistantConnectionStatus) => void;
  timeoutMs?: number;
  assistantId?: string;
}

/** One connection owns its timeout, receiver and availability until disposed or failed. */
export const createAssistantConnection = (
  bridge: HostBridge,
  options: AssistantConnectionOptions,
  initialTimeoutDiagnostic?: IntegrationDiagnostic,
) => {
  if (bridge.signal.aborted) {
    throw createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE);
  }

  let timeoutDiagnostic: IntegrationDiagnostic = initialTimeoutDiagnostic ?? {
    code: 'CONNECTION_TIMEOUT',
    phase: 'receiver-ready',
    mode: 'embedded',
    message: 'Assistant receiver did not become ready in time.',
  };

  let active = true;
  let detach: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  let close: () => void = () => {};

  const closed = new Promise<void>((resolve) => {
    close = resolve;
  });

  const disconnect = () => {
    clearTimeout(timer);

    const previous = detach;

    detach = undefined;
    previous?.();
    bridge.notifyAssistantUnmounted();
  };

  const fail = (
    diagnostic: IntegrationDiagnostic = {
      code: 'CONNECTION_FAILED',
      phase: 'receiver-ready',
      mode: 'embedded',
      message: 'Assistant connection failed.',
    },
  ) => {
    if (!active) {
      return;
    }

    active = false;
    bridge.signal.removeEventListener('abort', dispose);
    bridge.reportDiagnostic(diagnostic);
    disconnect();
    close();
    options.onStatus?.('error');
  };

  const loading = () => {
    if (!active) {
      return;
    }

    disconnect();
    timer = setTimeout(() => fail(timeoutDiagnostic), options.timeoutMs ?? 10_000);
    options.onStatus?.('loading');
  };

  const dispose = () => {
    if (!active) {
      return;
    }

    active = false;
    bridge.signal.removeEventListener('abort', dispose);
    disconnect();
    close();
  };

  bridge.signal.addEventListener('abort', dispose, { once: true });
  loading();

  return {
    closed,
    isActive: () => active,
    loading,
    fail,
    setTimeoutDiagnostic: (diagnostic: IntegrationDiagnostic) => {
      timeoutDiagnostic = diagnostic;
    },
    attach: (cleanup: () => void) => {
      if (!active) {
        cleanup();

        return;
      }

      detach?.();
      detach = cleanup;
    },
    ready: () => {
      if (!active) {
        return;
      }

      clearTimeout(timer);
      bridge.notifyAssistantReady(options.assistantId ?? 'assistant');
      options.onStatus?.('ready');
    },
    dispose,
  };
};

export const connectEmbeddedAssistant = (
  integration: HostIntegration,
  options: AssistantConnectionOptions,
  timeoutDiagnostic?: IntegrationDiagnostic,
) => {
  const connection = createAssistantConnection(integration.bridge, options, timeoutDiagnostic);
  let currentReceiver: symbol | undefined;

  const onReady: EmbeddedAssistantOptions['onReady'] = (handler) => {
    if (!connection.isActive()) {
      return () => {};
    }

    const detach = attachAssistantCommandHandler(integration.bridge, handler);
    const receiver = Symbol();

    currentReceiver = receiver;
    connection.attach(detach);
    connection.ready();

    return () => {
      detach();

      if (connection.isActive() && currentReceiver === receiver) {
        currentReceiver = undefined;
        connection.loading();
      }
    };
  };

  return { ...connection, bridge: integration.assistantClient, onReady };
};
