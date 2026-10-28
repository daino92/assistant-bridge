import { afterEach, expect, it, vi } from 'vitest';

import { WebSocketAgent, type RunAgentInput } from '@/ag-ui';

const INPUT: RunAgentInput = {
  threadId: 'thread',
  runId: 'run',
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};

const connect = (timeoutMs = 1000) => {
  class FakeSocket {
    static instances: FakeSocket[] = [];

    static OPEN = 1;

    readyState = 1;

    onopen: (() => void) | null = null;

    onmessage: ((event: { data: string }) => void) | null = null;

    onerror: (() => void) | null = null;

    onclose: (() => void) | null = null;

    close = vi.fn();

    send = vi.fn();

    constructor() {
      FakeSocket.instances.push(this);
    }
  }

  vi.stubGlobal('WebSocket', FakeSocket);

  const agent = new WebSocketAgent({
    url: 'ws://test/agent',
    input: INPUT,
    signal: new AbortController().signal,
    timeoutMs,
  });

  const error = vi.fn();
  const next = vi.fn();

  agent.run(INPUT).subscribe({ error, next });

  return { socket: FakeSocket.instances[0], error, next };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([
  ['malformed JSON', '{PRIVATE'],
  ['invalid schema', JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', delta: 'PRIVATE' })],
  ['wrong run', JSON.stringify({ type: 'RUN_STARTED', threadId: 'other', runId: 'other' })],
])('reports a typed protocol failure for %s without leaking payloads', (_name, payload) => {
  const { socket, error } = connect();

  socket.onmessage!({ data: payload });
  expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'PROTOCOL_ERROR' }));
  expect(error.mock.calls[0][0].message).not.toContain('PRIVATE');
  expect(socket.close).toHaveBeenCalledOnce();
});

it('distinguishes transport error, premature close and timeout', async () => {
  vi.useFakeTimers();

  const connection = connect();

  connection.socket.onerror!();
  expect(connection.error).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'CONNECTION_FAILED' }),
  );

  const closed = connect();

  closed.socket.onclose!();
  expect(closed.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONNECTION_CLOSED' }));

  const deadline = connect(10);

  await vi.advanceTimersByTimeAsync(10);
  expect(deadline.error).toHaveBeenCalledWith(expect.objectContaining({ code: 'TIMEOUT' }));
  expect(vi.getTimerCount()).toBe(0);
});

it('replaces RUN_ERROR text with the safe catalog before exposing events', () => {
  const { socket, next } = connect();

  socket.onmessage!({
    data: JSON.stringify({ type: 'RUN_ERROR', code: 'RATE_LIMITED', message: 'PRIVATE token' }),
  });
  expect(next.mock.calls[0][0]).toMatchObject({
    code: 'RATE_LIMITED',
    message: 'The assistant is busy. Please try again shortly.',
  });
  expect(JSON.stringify(next.mock.calls)).not.toContain('PRIVATE');
});
