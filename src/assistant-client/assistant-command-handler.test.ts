import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachAssistantCommandHandler } from '@/assistant-client';
import { createHostIntegration } from '@/create-host-integration';
import { ERROR_CODES } from '@/contracts';

const dispose: Array<() => void> = [];

afterEach(() => {
  dispose
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
});

describe('same-window assistant commands', () => {
  it('routes correlated commands to an async receiver without exposing host services', async () => {
    const integration = createHostIntegration({ actions: [] });

    const handler = vi.fn(async (request) => ({
      accepted: request.command,
      payload: request.payload,
    }));

    const detach = attachAssistantCommandHandler(integration.bridge, handler);

    dispose.push(() => integration.bridge.destroy(), detach);
    integration.bridge.notifyAssistantReady('direct-chat');
    await expect(
      Promise.all([
        integration.assistantCommands.prefill('Hello'),
        integration.assistantCommands.open(),
      ]),
    ).resolves.toEqual([
      { accepted: 'assistant.prefill', payload: { text: 'Hello' } },
      { accepted: 'assistant.open', payload: {} },
    ]);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('returns failures and rejects pending commands when the receiver unmounts', async () => {
    const integration = createHostIntegration({ actions: [] });

    const detach = attachAssistantCommandHandler(integration.bridge, () => {
      throw new Error('Receiver failed');
    });

    dispose.push(() => integration.bridge.destroy(), detach);
    integration.bridge.notifyAssistantReady('direct-chat');
    await expect(integration.assistantCommands.open()).rejects.toMatchObject({
      code: ERROR_CODES.EXECUTION_FAILED,
      message: 'The host action failed. Please try again.',
    });
    detach();

    const detachPending = attachAssistantCommandHandler(
      integration.bridge,
      () => new Promise(() => {}),
    );

    dispose.push(detachPending);

    const pending = integration.assistantCommands.open();

    detachPending();
    integration.bridge.notifyAssistantUnmounted();
    await expect(pending).rejects.toMatchObject({ code: ERROR_CODES.RECEIVER_UNAVAILABLE });
  });
});
