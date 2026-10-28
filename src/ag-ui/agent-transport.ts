import { createRunError, RUN_ERROR_CODES } from '@/ag-ui';

export interface AgentTransport {
  send: (value: unknown) => void;
  close: () => void;
}

export interface TransportCallbacks {
  open: () => void;
  message: (body: string) => void;
  error: (error: Error) => void;
  closed: () => void;
}

export const connectWebSocket = (url: string, callbacks: TransportCallbacks): AgentTransport => {
  let socket: WebSocket;

  try {
    socket = new WebSocket(url);
  } catch {
    queueMicrotask(() => callbacks.error(createRunError(RUN_ERROR_CODES.CONNECTION_FAILED)));

    return { send: () => {}, close: () => {} };
  }

  socket.onopen = callbacks.open;
  socket.onmessage = (event) => callbacks.message(String(event.data));
  socket.onerror = () => callbacks.error(createRunError(RUN_ERROR_CODES.CONNECTION_FAILED));
  socket.onclose = callbacks.closed;

  return {
    send: (value) => {
      if (socket.readyState === WebSocket.OPEN) {
        const body = JSON.stringify(value);

        try {
          socket.send(body);
        } catch {
          callbacks.error(createRunError(RUN_ERROR_CODES.CONNECTION_FAILED));
        }
      }
    },
    close: () => {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
    },
  };
};
