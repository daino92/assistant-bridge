import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectEmbeddedAssistant } from '@/connections';
import { createIntegration } from '@/create-host-integration';
import { ASSISTANT_COMMAND_NAMES, ERROR_CODES, type AssistantCommandRequest } from '@/contracts';
import { answer, READY } from '../../test/command-answers';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

const connect = (timeoutMs = 1000) => {
  const integration = createIntegration({ actions: [] });
  const onStatus = vi.fn();
  const connection = connectEmbeddedAssistant(integration, { onStatus, timeoutMs });

  cleanups.push(() => integration.bridge.destroy(), connection.dispose);

  return { integration, connection, onStatus };
};

describe('assistant connection lifecycle', () => {
  it('refuses an assistant with an incompatible or missing protocol version', () => {
    for (const info of [undefined, { protocolVersion: '1.0.0' }, { protocolVersion: 'x' }]) {
      const { integration, connection, onStatus } = connect();
      const handler = vi.fn(answer);

      connection.onReady(handler, info);
      expect(onStatus).toHaveBeenLastCalledWith('error');
      expect(integration.bridge.isAssistantAvailable()).toBe(false);
      expect(connection.isActive()).toBe(false);
    }

    // Same major, newer minor: compatible.
    const { integration, connection, onStatus } = connect();
    const [major] = READY.protocolVersion.split('.');

    connection.onReady(answer, { protocolVersion: `${major}.9.3` });
    expect(onStatus).toHaveBeenLastCalledWith('ready');
    expect(integration.bridge.isAssistantAvailable()).toBe(true);
  });

  it('connects without an onStatus callback', async () => {
    const integration = createIntegration({ actions: [] });
    const connection = connectEmbeddedAssistant(integration, { timeoutMs: 1000 });

    cleanups.push(() => integration.bridge.destroy(), connection.dispose);
    connection.onReady(answer, READY);
    await expect(integration.assistantCommands.open()).resolves.toEqual({ opened: true });
  });

  it('times out and ignores receivers that arrive after failure', () => {
    vi.useFakeTimers();

    const { integration, connection, onStatus } = connect();

    vi.advanceTimersByTime(1000);
    connection.onReady(vi.fn(), READY);
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['loading', 'error']);
    expect(integration.bridge.isAssistantAvailable()).toBe(false);
    expect(connection.isActive()).toBe(false);
  });

  it('allows effect cleanup and remount without an old cleanup removing the new receiver', async () => {
    const { integration, connection, onStatus } = connect();
    const first = vi.fn(answer);
    const second = vi.fn(answer);
    const firstCleanup = connection.onReady(first, READY);
    const secondCleanup = connection.onReady(second, READY);

    firstCleanup();
    await expect(integration.assistantCommands.open()).resolves.toEqual({ opened: true });
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    secondCleanup();
    expect(integration.bridge.isAssistantAvailable()).toBe(false);

    const remounted = vi.fn(answer);

    connection.onReady(remounted, READY);
    await expect(integration.assistantCommands.open()).resolves.toEqual({ opened: true });
    expect(remounted).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith('ready');
  });

  it('rejects pending commands on disposal and does not revive on late readiness', async () => {
    const { integration, connection } = connect();

    connection.onReady(() => new Promise(() => {}), READY);

    const pending = integration.assistantCommands.open();

    connection.dispose();
    await expect(pending).rejects.toMatchObject({ code: ERROR_CODES.RECEIVER_UNAVAILABLE });
    connection.ready();
    expect(integration.bridge.isAssistantAvailable()).toBe(false);
  });

  it('opens before submitting prompts and includes the current selection and revision', async () => {
    const { integration, connection } = connect();
    const handler = vi.fn((request: AssistantCommandRequest) => answer(request));

    connection.onReady(handler, READY);

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

  it('checks each answer against the command contract', async () => {
    const { integration, connection } = connect();

    // An assistant from before typed results answers submitPrompt with `acknowledged`.
    connection.onReady(
      (request) =>
        request.command === ASSISTANT_COMMAND_NAMES.SUBMIT_PROMPT
          ? { acknowledged: true }
          : { ...answer(request), extra: 'ignored' },
      READY,
    );

    await expect(integration.assistantCommands.open()).resolves.toEqual({ opened: true });
    await expect(integration.assistantCommands.submitPrompt('Hi')).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_PAYLOAD,
    });
    await expect(integration.assistantCommands.askAbout('Hi')).rejects.toBeInstanceOf(Error);
  });

  it('passes metadata with askAbout options, and keeps the host revision', async () => {
    const { integration, connection } = connect();
    const handler = vi.fn((request: AssistantCommandRequest) => answer(request));

    connection.onReady(handler, READY);

    const selection = { type: 'record', id: '123' };

    await integration.assistantCommands.askAbout('Explain this', {
      selection,
      metadata: { questionContext: 'Section text', contextRevision: -1 },
    });

    expect(handler.mock.calls[1][0].payload).toEqual({
      prompt: 'Explain this',
      metadata: {
        questionContext: 'Section text',
        selection,
        contextRevision: integration.contextManager.getSnapshot().revision,
      },
    });

    await integration.assistantCommands.askAbout('Plain question', {});

    expect(handler.mock.calls[3][0].payload).toEqual({
      prompt: 'Plain question',
      metadata: { contextRevision: integration.contextManager.getSnapshot().revision },
    });
  });
});
