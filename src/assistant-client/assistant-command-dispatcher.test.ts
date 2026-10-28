import { expect, it, vi } from 'vitest';

import { createAssistantCommandDispatcher } from '@/assistant-client';
import { PROTOCOL_VERSION, type AssistantCommandRequest } from '@/contracts';

const request = (command: string, payload: unknown = {}): AssistantCommandRequest => ({
  protocolVersion: PROTOCOL_VERSION,
  requestId: crypto.randomUUID(),
  command,
  payload,
});

it('dispatches supported commands and preserves default acknowledgements', async () => {
  const open = vi.fn();
  const close = vi.fn();
  const focus = vi.fn();
  const prefill = vi.fn();
  const submit = vi.fn();

  const dispatch = createAssistantCommandDispatcher({
    onOpen: open,
    onClose: close,
    onFocus: focus,
    onPrefill: prefill,
    onSubmit: submit,
  });

  await expect(dispatch(request('assistant.open'))).resolves.toEqual({ opened: true });
  await expect(dispatch(request('assistant.close'))).resolves.toEqual({ closed: true });
  await expect(dispatch(request('assistant.focus'))).resolves.toEqual({ focused: true });
  await expect(dispatch(request('assistant.prefill', { text: 'Hello' }))).resolves.toEqual({
    prefilled: true,
  });
  await expect(
    dispatch(request('assistant.submitPrompt', { prompt: 'Ask', metadata: { source: 'host' } })),
  ).resolves.toEqual({ acknowledged: true });
  expect(open).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(focus).toHaveBeenCalledOnce();
  expect(prefill).toHaveBeenCalledExactlyOnceWith('Hello');
  expect(submit).toHaveBeenCalledExactlyOnceWith('Ask', { source: 'host' });
});

it('validates envelopes and payloads before callbacks, with typed errors for unsupported commands', async () => {
  const prefill = vi.fn();
  const submit = vi.fn();
  const dispatch = createAssistantCommandDispatcher({ onPrefill: prefill, onSubmit: submit });

  for (const invalid of [
    request('assistant.prefill', { text: 42 }),
    request('assistant.submitPrompt', { prompt: '' }),
    { ...request('assistant.prefill', { text: 'Hello' }), protocolVersion: 'invalid' },
  ]) {
    await expect(
      Promise.resolve().then(() => dispatch(invalid as AssistantCommandRequest)),
    ).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    });
  }

  for (const command of ['assistant.unknown', 'assistant.close']) {
    await expect(Promise.resolve().then(() => dispatch(request(command)))).rejects.toMatchObject({
      code: 'UNKNOWN_COMMAND',
    });
  }

  expect(prefill).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

it('awaits asynchronous callbacks, preserves custom results and propagates failures', async () => {
  let complete!: (value: unknown) => void;

  const dispatch = createAssistantCommandDispatcher({
    onSubmit: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });

  const pending = dispatch(request('assistant.submitPrompt', { prompt: 'Hello' }));

  complete({ acknowledged: true, messageId: 'one' });
  await expect(pending).resolves.toEqual({ acknowledged: true, messageId: 'one' });

  const failure = Object.assign(new Error('Handler failed'), { code: 'SERVICE_UNAVAILABLE' });

  const failing = createAssistantCommandDispatcher({
    onClose: async () => {
      throw failure;
    },
  });

  await expect(failing(request('assistant.close'))).rejects.toBe(failure);
});
