import { beforeEach, expect, it, vi } from 'vitest';

import { createChatSession, type ChatSessionMessage, type AgentOptions } from '@/ag-ui';

const runAgent = vi.hoisted(() => vi.fn());

vi.mock('./run-websocket-agent.js', () => ({ runWebSocketAgent: runAgent }));

const setup = () => {
  let activeId: string | null = null;
  const messages: Record<string, ChatSessionMessage[]> = {};

  const session = createChatSession({
    url: 'ws://test/agent',
    storage: {
      getActiveId: () => activeId,
      createConversation: () => {
        activeId = 'first';
        messages.first = [];

        return activeId;
      },
      getMessages: (id) => messages[id] ?? [],
      append: (id, message) => messages[id].push(message),
      update: (id, messageId, patch) => {
        messages[id] = messages[id].map((message) =>
          message.id === messageId ? { ...message, ...patch } : message,
        );
      },
    },
  });

  return {
    session,
    messages,
    select: (id: string) => {
      activeId = id;
      messages[id] = [];
    },
  };
};

beforeEach(() => {
  runAgent.mockReset();
});

it('streams into the originating conversation even after selection changes', async () => {
  const { session, messages, select } = setup();
  let finish!: () => void;
  let options!: AgentOptions;

  runAgent.mockImplementation((request: AgentOptions) => {
    options = request;

    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });

  const first = session.submit(' Hello ');

  expect(() => session.submit('duplicate')).toThrow();
  expect(messages.first).toHaveLength(2);
  select('other');
  options.onText('Hi');
  finish();
  await first;
  expect(messages.first[1]).toMatchObject({ text: 'Hi', status: 'complete' });
  expect(messages.other).toEqual([]);
  session.dispose();
});

it('retries a failed answer without duplicating the user message and excludes failed history', async () => {
  const { session, messages } = setup();

  runAgent.mockRejectedValueOnce(new Error('private provider detail'));
  await session.submit('Question');

  const answer = messages.first[1];

  expect(answer.status).toBe('error');
  expect(answer.activity).not.toContain('private');
  runAgent.mockImplementation(async (options: AgentOptions) => {
    expect(options.input.messages).toEqual([
      { id: messages.first[0].id, role: 'user', content: 'Question' },
    ]);
    options.onText('Answer');
  });
  await session.submit('Question', { retryId: answer.id });
  expect(messages.first).toHaveLength(2);
  expect(messages.first[1]).toMatchObject({ id: answer.id, text: 'Answer', status: 'complete' });
  expect(() => session.submit('Question', { retryId: answer.id })).toThrow();
  session.dispose();
});

it('stops and finalizes pending answers, ignores late text and refuses writes after disposal', async () => {
  const { session, messages } = setup();
  let options!: AgentOptions;

  runAgent.mockImplementation((request: AgentOptions) => {
    options = request;

    return new Promise<void>(() => {});
  });

  const result = session.submit('Question');

  session.stop();
  expect((await result).status).toBe('stopped');
  options.onText('late text');
  expect(messages.first[1]).toMatchObject({ text: '', status: 'stopped' });
  session.dispose();
  expect(() => session.submit('another')).toThrow();
  expect(messages.first).toHaveLength(2);
});

it('keeps question context out of messages, snapshots it and preserves it for retry only', async () => {
  const { session, messages } = setup();
  const context = [{ description: 'Question context', value: 'model-only data' }];
  const calls: AgentOptions[] = [];

  runAgent.mockImplementation(async (options: AgentOptions) => {
    calls.push(options);

    if (calls.length === 1) {
      throw new Error('Failure');
    }
  });
  await session.submit('Visible question', { context });
  context[0].value = 'MUTATED';
  expect(messages.first[0].text).toBe('Visible question');
  expect(calls[0].input.messages[0].content).toBe('Visible question');
  expect(calls[0].input.context).toEqual([
    { description: 'Question context', value: 'model-only data' },
  ]);
  await session.submit('Visible question', { retryId: messages.first[1].id });
  expect(calls[1].input.context).toEqual(calls[0].input.context);
  await session.submit('Next question');
  expect(calls[2].input.context).toEqual([]);
  session.dispose();
});
