import type { Client } from '@stomp/stompjs';

import { AGENT_STOMP_DESTINATIONS, createRunError, RUN_ERROR_CODES } from '@/ag-ui';

import type { AgentTransport, TransportCallbacks } from './agent-transport.js';

/** One STOMP session per run; no reconnect/replay of business actions. */
export const connectStomp = (url: string, callbacks: TransportCallbacks): AgentTransport => {
  let client: Client | undefined;
  let disposed = false;
  const setupTimer = setTimeout(() => fail(RUN_ERROR_CODES.TIMEOUT), 10_000);

  const fail = (code: 'TIMEOUT' | 'CONNECTION_FAILED') => {
    clearTimeout(setupTimer);

    if (!disposed) {
      callbacks.error(createRunError(code));
    }
  };

  void import('@stomp/stompjs')
    .then(({ Client, Versions }) => {
      if (disposed) {
        return;
      }

      client = new Client({
        brokerURL: url,
        connectHeaders: { host: new URL(url).host },
        stompVersions: new Versions(['1.2']),
        reconnectDelay: 0,
        heartbeatIncoming: 0,
        heartbeatOutgoing: 0,
        connectionTimeout: 10_000,
        onConnect: () => {
          if (disposed) {
            return;
          }

          const receipt = crypto.randomUUID();

          client!.watchForReceipt(receipt, () => {
            if (!disposed) {
              clearTimeout(setupTimer);
              callbacks.open();
            }
          });
          client!.subscribe(
            AGENT_STOMP_DESTINATIONS.events,
            (frame) => {
              if (!disposed) {
                callbacks.message(frame.body);
              }
            },
            { id: 'agent-events', ack: 'auto', receipt },
          );
        },
        onStompError: () => fail(RUN_ERROR_CODES.CONNECTION_FAILED),
        onWebSocketError: () => fail(RUN_ERROR_CODES.CONNECTION_FAILED),
        onWebSocketClose: () => {
          clearTimeout(setupTimer);

          if (!disposed) {
            callbacks.closed();
          }
        },
      });
      client.activate();
    })
    .catch(() => {
      if (!disposed) {
        fail(RUN_ERROR_CODES.CONNECTION_FAILED);
      }
    });

  return {
    send: (value) => {
      if (!disposed && client?.connected) {
        const body = JSON.stringify(value);

        try {
          client.publish({
            destination: AGENT_STOMP_DESTINATIONS.controls,
            body,
            headers: { 'content-type': 'application/json' },
          });
        } catch {
          fail(RUN_ERROR_CODES.CONNECTION_FAILED);
        }
      }
    },
    close: () => {
      disposed = true;
      clearTimeout(setupTimer);
      void client?.deactivate({ force: true }).catch(() => {});
    },
  };
};
