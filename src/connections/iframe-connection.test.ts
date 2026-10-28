import { MessageChannel } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHostIntegration } from '@/create-host-integration';
import { ASSISTANT_IFRAME_MESSAGES } from '@/contracts';
import { connectAssistantIframe, createAssistantIframeUrl } from '@/connections';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('host iframe handshake', () => {
  it('rejects stale sessions, invalid contexts and messages from other windows in the chat', () => {
    const parentFrame = document.createElement('iframe');

    document.body.append(parentFrame);

    const parent = parentFrame.contentWindow!;

    vi.spyOn(window, 'parent', 'get').mockReturnValue(parent);

    const postMessage = vi.spyOn(parent, 'postMessage').mockImplementation(() => {});
    const integration = createHostIntegration({ appId: 'test', actions: [] });
    const onClient = vi.fn();

    const disconnect = connectAssistantIframe({
      hostOrigin: 'https://host.example',
      onClient,
      onContext: vi.fn(),
      onCommand: vi.fn(),
    });

    const channel = new MessageChannel();

    cleanups.push(
      () => parentFrame.remove(),
      () => integration.bridge.destroy(),
      () => channel.port1.close(),
      () => channel.port2.close(),
      disconnect,
    );

    const { sessionId } = postMessage.mock.calls[0][0] as { sessionId: string };

    const send = (
      session: string,
      context: unknown,
      origin = 'https://host.example',
      source: MessageEventSource = parent,
    ) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin,
          source,
          data: { type: ASSISTANT_IFRAME_MESSAGES.CONNECT, sessionId: session, context },
          ports: [channel.port1 as unknown as MessagePort],
        }),
      );
    };

    const context = integration.contextManager.getSnapshot();

    send('stale-session', context);
    send(sessionId, { invalid: true });
    send(sessionId, context, 'https://wrong.example');
    send(sessionId, context, 'https://host.example', window);
    expect(onClient).not.toHaveBeenCalled();
    send(sessionId, context);
    expect(onClient).toHaveBeenCalledOnce();
    send(sessionId, context);
    expect(onClient).toHaveBeenCalledOnce();
    disconnect();
    expect(onClient).toHaveBeenLastCalledWith(undefined);
  });
  it('checks exact source and origin, waits for acknowledgement, and reconnects a reloaded frame', async () => {
    vi.stubGlobal('MessageChannel', MessageChannel);

    const integration = createHostIntegration({ appId: 'test', actions: [] });
    const iframe = document.createElement('iframe');

    document.body.append(iframe);

    const transferredPorts: MessagePort[] = [];

    const postMessage = vi
      .spyOn(iframe.contentWindow!, 'postMessage')
      .mockImplementation((_message, _options, transfer?: Transferable[]) => {
        transferredPorts.push(...((transfer ?? []) as MessagePort[]));
      });

    const onStatus = vi.fn();
    const dispose = integration.connectIframe({ iframe, url: 'https://chat.example/', onStatus });

    cleanups.push(
      () => iframe.remove(),
      () => integration.bridge.destroy(),
      dispose,
    );

    const ready = (origin: string, source: MessageEventSource | null, sessionId: unknown) => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin,
          source,
          data: { type: ASSISTANT_IFRAME_MESSAGES.READY, sessionId },
        }),
      );
    };

    ready('https://wrong.example', iframe.contentWindow, 'one');
    ready('https://chat.example', window, 'one');
    ready('https://chat.example', iframe.contentWindow, 123);
    expect(postMessage).not.toHaveBeenCalled();
    ready('https://chat.example', iframe.contentWindow, 'one');
    expect(postMessage).toHaveBeenCalledOnce();
    expect(integration.bridge.isAssistantAvailable()).toBe(false);

    transferredPorts[0].postMessage({ type: ASSISTANT_IFRAME_MESSAGES.CONNECTED });
    await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith('ready'));
    expect(integration.bridge.isAssistantAvailable()).toBe(true);
    ready('https://chat.example', iframe.contentWindow, 'one');
    expect(postMessage).toHaveBeenCalledOnce();
    ready('https://chat.example', iframe.contentWindow, 'two');
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(integration.bridge.isAssistantAvailable()).toBe(false);
    dispose();
    ready('https://chat.example', iframe.contentWindow, 'three');
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('preserves assistant URL options while adding host connection parameters', () => {
    const url = new URL(createAssistantIframeUrl('/chat/?theme=light', 'https://host.example'));

    expect(url.searchParams.get('theme')).toBe('light');
    expect(url.searchParams.get('embedded')).toBe('1');
    expect(url.searchParams.get('hostOrigin')).toBe('https://host.example');
  });
});
