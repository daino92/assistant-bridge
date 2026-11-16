import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineAction } from '@/actions';
import { ERROR_CODES } from '@/contracts';
import { createHostIntegration, type HostIntegration } from '@/create-host-integration';
import { navigateAction } from '@/actions';
import { connectTestAssistant } from '@/testing';

const disposers: Array<() => void> = [];

afterEach(() => disposers.splice(0).forEach((dispose) => dispose()));

const host = (onPublish = vi.fn()) => {
  const integration: HostIntegration = createHostIntegration({
    actions: [
      navigateAction({ navigate: vi.fn(), allowedRoutes: ['/', '/entries'] }),
      defineAction({
        name: 'entries.publish',
        description: 'Publish an entry',
        schema: z.object({ id: z.string() }).strict(),
        requiresConfirmation: true,
        exposeErrorMessages: true,
        handler: ({ id }) => onPublish(id),
      }),
    ],
  });

  disposers.push(() => integration.dispose());

  return integration;
};

it('runs actions like a real assistant, with approval and public errors', async () => {
  const publish = vi.fn((id: string) => ({ published: id }));
  const assistant = connectTestAssistant(host(publish), { approve: true });

  expect(assistant.capabilities()).toEqual(['ui.navigate', 'entries.publish']);
  await expect(assistant.run('ui.navigate', { path: '/entries' })).resolves.toEqual({
    path: '/entries',
  });
  await expect(assistant.run('entries.publish', { id: 'e1' })).resolves.toEqual({
    published: 'e1',
  });
  expect(assistant.confirmations.map((request) => request.name)).toEqual(['entries.publish']);

  await expect(assistant.run('entries.publish', { id: 1 })).rejects.toMatchObject({
    code: ERROR_CODES.INVALID_PAYLOAD,
  });
  await expect(assistant.run('ui.navigate', { path: '/admin' })).rejects.toMatchObject({
    code: ERROR_CODES.ACTION_NOT_AVAILABLE,
  });

  publish.mockImplementation(() => {
    throw new Error('Entry changed. Reload it.');
  });
  await expect(assistant.run('entries.publish', { id: 'e1' })).rejects.toMatchObject({
    message: 'Entry changed. Reload it.',
  });
  assistant.dispose();
});

it('declines approval by default, or as the approve callback decides', async () => {
  const publish = vi.fn();
  const declining = connectTestAssistant(host(publish));

  await expect(declining.run('entries.publish', { id: 'e1' })).rejects.toMatchObject({
    code: ERROR_CODES.ACTION_REJECTED,
  });
  expect(publish).not.toHaveBeenCalled();
  declining.dispose();

  const deciding = connectTestAssistant(host(publish), {
    approve: (request) => (request.args as { id: string }).id === 'ok',
  });

  await expect(deciding.run('entries.publish', { id: 'no' })).rejects.toBeInstanceOf(Error);
  await deciding.run('entries.publish', { id: 'ok' });
  expect(publish).toHaveBeenCalledExactlyOnceWith('ok');
  deciding.dispose();
});

it('answers host commands by contract, records them and can refuse them', async () => {
  const integration = host();
  const assistant = connectTestAssistant(integration);

  await expect(integration.assistantCommands.askAbout('Summarize')).resolves.toEqual({
    accepted: true,
  });
  expect(assistant.commands.map((request) => request.command)).toEqual([
    'assistant.open',
    'assistant.submitPrompt',
  ]);
  expect(assistant.commands[1].payload).toMatchObject({ prompt: 'Summarize' });
  assistant.dispose();
  await expect(integration.assistantCommands.open()).rejects.toMatchObject({
    code: ERROR_CODES.RECEIVER_UNAVAILABLE,
  });

  const busy = connectTestAssistant(integration, {
    onCommand: () => {
      throw new Error('Still answering');
    },
  });

  await expect(integration.assistantCommands.submitPrompt('Again')).rejects.toBeInstanceOf(Error);
  busy.dispose();
});
