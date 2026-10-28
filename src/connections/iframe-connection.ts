import { createPortAssistantClient, attachHostPort } from '@/bridge';
import type { AssistantBridgeClient, AssistantCommandHandler } from '@/assistant-client';
import { ASSISTANT_IFRAME_MESSAGES, hostContextSchema, type HostContext } from '@/contracts';
import type { HostIntegration } from '@/create-host-integration';
import { createAssistantConnection, type AssistantConnectionOptions } from '@/connections';

export interface HostIframeConnectionOptions extends AssistantConnectionOptions {
  iframe: HTMLIFrameElement;
  url: string;
}

export const createAssistantIframeUrl = (url: string, hostOrigin: string): string => {
  const target = new URL(url, hostOrigin);

  target.searchParams.set('embedded', '1');
  target.searchParams.set('hostOrigin', hostOrigin);

  return target.href;
};

export const connectHostIframe = (
  integration: HostIntegration,
  options: HostIframeConnectionOptions,
): (() => void) => {
  const origin = new URL(options.url, window.location.origin).origin;

  const connection = createAssistantConnection(
    integration.bridge,
    {
      ...options,
      assistantId: options.assistantId ?? 'assistant-iframe',
      timeoutMs: options.timeoutMs ?? 8000,
    },
    {
      code: 'IFRAME_HANDSHAKE_TIMEOUT',
      phase: 'handshake',
      mode: 'iframe',
      message: 'Assistant iframe handshake timed out.',
    },
  );

  let sessionId: string | undefined;

  const connect = (event: MessageEvent<unknown>) => {
    if (
      !connection.isActive() ||
      event.origin !== origin ||
      event.source !== options.iframe.contentWindow
    ) {
      return;
    }

    const data = event.data as { type?: string; sessionId?: unknown } | null;

    if (
      data?.type !== ASSISTANT_IFRAME_MESSAGES.READY ||
      typeof data.sessionId !== 'string' ||
      sessionId === data.sessionId
    ) {
      return;
    }

    sessionId = data.sessionId;
    connection.loading();

    const channel = new MessageChannel();

    const onConnected = (message: MessageEvent<unknown>) => {
      if (
        (message.data as { type?: string } | null)?.type === ASSISTANT_IFRAME_MESSAGES.CONNECTED
      ) {
        channel.port1.removeEventListener('message', onConnected);
        connection.ready();
      }
    };

    channel.port1.addEventListener('message', onConnected);

    const detach = attachHostPort(channel.port1, integration.bridge);

    connection.attach(() => {
      channel.port1.removeEventListener('message', onConnected);
      detach();
      channel.port2.close();
    });

    try {
      options.iframe.contentWindow?.postMessage(
        {
          type: ASSISTANT_IFRAME_MESSAGES.CONNECT,
          sessionId,
          context: integration.contextManager.getSnapshot(),
        },
        origin,
        [channel.port2],
      );
    } catch {
      connection.fail({
        code: 'IFRAME_HANDSHAKE_FAILED',
        phase: 'handshake',
        mode: 'iframe',
        message: 'Assistant iframe port transfer failed.',
      });
    }
  };

  window.addEventListener('message', connect);
  void connection.closed.then(() => window.removeEventListener('message', connect));

  return () => {
    window.removeEventListener('message', connect);
    connection.dispose();
  };
};

export interface AssistantIframeConnectionOptions {
  hostOrigin: string;
  onCommand: AssistantCommandHandler;
  onClient: (client: AssistantBridgeClient | undefined) => void;
  onContext?: (context: HostContext) => void;
}

/** The chat supplies its trusted parent origin; no host internals cross this boundary. */
export const connectAssistantIframe = (options: AssistantIframeConnectionOptions): (() => void) => {
  if (window.parent === window) {
    return () => {};
  }

  try {
    if (new URL(options.hostOrigin).origin !== options.hostOrigin) {
      return () => {};
    }
  } catch {
    return () => {};
  }

  let dispose: (() => void) | undefined;
  const sessionId = crypto.randomUUID();

  const connect = (event: MessageEvent<unknown>) => {
    if (event.origin !== options.hostOrigin || event.source !== window.parent || dispose) {
      return;
    }

    const data = event.data as { type?: string; context?: unknown; sessionId?: unknown } | null;

    if (
      data?.type !== ASSISTANT_IFRAME_MESSAGES.CONNECT ||
      data.sessionId !== sessionId ||
      !event.ports[0]
    ) {
      return;
    }

    const parsed = hostContextSchema.safeParse(data.context);

    if (!parsed.success) {
      return;
    }

    const connection = createPortAssistantClient(event.ports[0], parsed.data, options.onCommand);

    const unsubscribe = options.onContext
      ? connection.client.subscribeContext(options.onContext)
      : undefined;

    dispose = () => {
      unsubscribe?.();
      connection.dispose();
    };

    options.onContext?.(parsed.data);
    options.onClient(connection.client);
    event.ports[0].postMessage({ type: ASSISTANT_IFRAME_MESSAGES.CONNECTED });
  };

  window.addEventListener('message', connect);
  window.parent.postMessage(
    { type: ASSISTANT_IFRAME_MESSAGES.READY, sessionId },
    options.hostOrigin,
  );

  return () => {
    window.removeEventListener('message', connect);
    dispose?.();
    options.onClient(undefined);
  };
};
