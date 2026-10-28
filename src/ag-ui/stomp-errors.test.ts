import { afterEach, expect, it, vi } from 'vitest';

import { connectStomp } from './stomp-transport.js';

interface Configuration {
  onConnect: () => void;
  onStompError: () => void;
  onWebSocketError: () => void;
  onWebSocketClose: () => void;
}

const state = vi.hoisted(() => ({
  configurations: [] as Configuration[],
  receipt: undefined as (() => void) | undefined,
}));

vi.mock('@stomp/stompjs', () => ({
  Versions: class {},
  Client: class {
    connected = true;

    constructor(configuration: Configuration) {
      state.configurations.push(configuration);
    }

    activate = vi.fn();

    deactivate = vi.fn(async () => {});

    subscribe = vi.fn();

    publish = vi.fn();

    watchForReceipt = (_id: string, callback: () => void) => {
      state.receipt = callback;
    };
  },
}));

const transports: Array<{ close: () => void }> = [];

const connect = async () => {
  const callbacks = { open: vi.fn(), message: vi.fn(), error: vi.fn(), closed: vi.fn() };
  const transport = connectStomp('ws://test/agent/stomp', callbacks);

  transports.push(transport);
  await vi.waitFor(() => expect(state.configurations).toHaveLength(1));

  return { callbacks, transport, configuration: state.configurations[0] };
};

afterEach(() => {
  transports.splice(0).forEach((transport) => transport.close());
  state.configurations.length = 0;
  state.receipt = undefined;
  vi.useRealTimers();
});

it('reports a typed setup timeout instead of guessing from a close reason', async () => {
  vi.useFakeTimers();

  const { callbacks } = await connect();

  await vi.advanceTimersByTimeAsync(10000);
  expect(callbacks.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'TIMEOUT' }));
});

it('maps STOMP and WebSocket rejection to a safe connection error', async () => {
  const { callbacks, configuration } = await connect();

  configuration.onStompError();
  configuration.onWebSocketError();
  expect(callbacks.error).toHaveBeenCalledTimes(2);
  expect(callbacks.error.mock.calls.every(([error]) => error.code === 'CONNECTION_FAILED')).toBe(
    true,
  );
});

it('clears the setup deadline only after the subscription receipt', async () => {
  vi.useFakeTimers();

  const { callbacks, configuration } = await connect();

  configuration.onConnect();
  expect(callbacks.open).not.toHaveBeenCalled();
  state.receipt!();
  await vi.advanceTimersByTimeAsync(20000);
  expect(callbacks.open).toHaveBeenCalledOnce();
  expect(callbacks.error).not.toHaveBeenCalled();
});
