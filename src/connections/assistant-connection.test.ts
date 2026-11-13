import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectEmbeddedAssistant } from '@/connections';
import { createHostIntegration } from '@/create-host-integration';
import { ASSISTANT_COMMAND_NAMES, ERROR_CODES, type AssistantCommandRequest } from '@/contracts';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

const connect = (timeoutMs = 1000) => {
  const integration = createHostIntegration({ actions: [] });
  const onStatus = vi.fn();
  const connection = connectEmbeddedAssistant(integration, { onStatus, timeoutMs });

  cleanups.push(() => integration.bridge.destroy(), connection.dispose);

  return { integration, connection, onStatus };
};

describe('assistant connection lifecycle', () => {
  it('connects without an onStatus callback', async () => {
    const integration = createHostIntegration({ actions: [] });
    const connection = connectEmbeddedAssistant(integration, { timeoutMs: 1000 });

    cleanups.push(() => integration.bridge.destroy(), connection.dispose);
    connection.onReady(() => 'ready');
    await expect(integration.assistantCommands.open()).resolves.toBe('ready');
  });

  it('times out and ignores receivers that arrive after failure', () => {
    vi.useFakeTimers();

    const { integration, connection, onStatus } = connect();

    vi.advanceTimersByTime(1000);
    connection.onReady(vi.fn());
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['loading', 'error']);
    expect(integration.bridge.isAssistantAvailable()).toBe(false);
    expect(connection.isActive()).toBe(false);
  });

  it('allows effect cleanup and remount without an old cleanup removing the new receiver', async () => {
    const { integration, connection, onStatus } = connect();
    const firstCleanup = connection.onReady(() => 'first');
    const secondCleanup = connection.onReady(() => 'second');

    firstCleanup();
    await expect(integration.assistantCommands.open()).resolves.toBe('second');
    secondCleanup();
    expect(integration.bridge.isAssistantAvailable()).toBe(false);
    connection.onReady(() => 'remounted');
    await expect(integration.assistantCommands.open()).resolves.toBe('remounted');
    expect(onStatus).toHaveBeenLastCalledWith('ready');
  });

  it('rejects pending commands on disposal and does not revive on late readiness', async () => {
    const { integration, connection } = connect();

    connection.onReady(() => new Promise(() => {}));

    const pending = integration.assistantCommands.open();

    connection.dispose();
    await expect(pending).rejects.toMatchObject({ code: ERROR_CODES.RECEIVER_UNAVAILABLE });
    connection.ready();
    expect(integration.bridge.isAssistantAvailable()).toBe(false);
  });

  it('opens before submitting prompts and includes the current selection and revision', async () => {
    const { integration, connection } = connect();
    const handler = vi.fn((_request: AssistantCommandRequest) => 'ok');

    connection.onReady(handler);

    const selection = { type: 'record', id: '123' };

    await integration.assistantCommands.askAbout('Explain this', selection);
    expect(handler.mock.calls.map(([request]) => request.command)).toEqual([
      ASSISTANT_COMMAND_NAMES.OPEN,
      ASSISTANT_COMMAND_NAMES.SUBMIT_PROMPT,
    ]);
    expect(handler.mock.calls[1][0].payload).toEqual({
      prompt: 'Explain this',
      metadata: { selection, contextRevision: integration.contextManager.getSnapshot().revision },
    });
    await integration.assistantCommands.prefillAndOpen('Draft');
    expect(handler.mock.calls.slice(2).map(([request]) => request.command)).toEqual([
      ASSISTANT_COMMAND_NAMES.OPEN,
      ASSISTANT_COMMAND_NAMES.PREFILL,
    ]);
  });
});
