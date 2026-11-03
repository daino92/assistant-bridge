import { afterEach, describe, expect, it, vi } from 'vitest';

import { createUiActions, type UiTargetActionName } from '@/actions';
import { createHostIntegration } from '@/create-host-integration';
import { ERROR_CODES, hostContextSchema } from '@/contracts';

const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
});

const cases = [
  { name: 'setValue', payload: { value: '' }, invalid: { value: 123 }, args: [''] },
  { name: 'setChecked', payload: { checked: false }, invalid: { checked: 'false' }, args: [false] },
  { name: 'setExpanded', payload: { expanded: true }, invalid: { expanded: 1 }, args: [true] },
  { name: 'activateTab', payload: {}, invalid: { targetId: 42 }, args: [] },
] satisfies Array<{
  name: UiTargetActionName;
  payload: object;
  invalid: object;
  args: unknown[];
}>;

describe('extended UI actions', () => {
  it.each(cases)(
    '$name validates payloads and invokes only supported target callbacks',
    async ({ name, payload, invalid, args }) => {
      const callback = vi.fn();

      const integration = createHostIntegration({
        actions: ({ targets }) =>
          createUiActions({ targets: { registry: targets, enable: [name] } }),
      });

      disposers.push(() => integration.dispose());

      const target = {
        id: 'control',
        highlight: vi.fn(),
        clearHighlight: vi.fn(),
        scrollIntoView: vi.fn(),
      };

      integration.targetRegistry.register(target);

      const request = (data: object) =>
        integration.assistantClient.requestHostAction(`ui.${name}`, data);

      await expect(request({ targetId: 'control', ...payload })).rejects.toMatchObject({
        code: ERROR_CODES.ACTION_NOT_AVAILABLE,
      });
      integration.targetRegistry.register({ ...target, [name]: callback });
      await expect(request({ targetId: 'control', ...payload })).resolves.toEqual({
        targetId: 'control',
        ...payload,
      });
      expect(callback).toHaveBeenCalledWith(...args);
      await expect(request({ targetId: 'control', ...invalid })).rejects.toMatchObject({
        code: ERROR_CODES.INVALID_PAYLOAD,
      });
      await expect(request({ targetId: 'missing', ...payload })).rejects.toMatchObject({
        code: ERROR_CODES.TARGET_NOT_FOUND,
      });
      expect(callback).toHaveBeenCalledOnce();
      expect(integration.targetRegistry.describe()[0].actions).toContain(name);
      expect(hostContextSchema.safeParse(integration.contextManager.getSnapshot()).success).toBe(
        true,
      );
      integration.targetRegistry.unregister('control');
      await expect(request({ targetId: 'control', ...payload })).rejects.toMatchObject({
        code: ERROR_CODES.TARGET_NOT_FOUND,
      });
    },
  );

  it('clearHighlight cancels the timer and rejects missing targets', async () => {
    const integration = createHostIntegration({
      actions: ({ targets }) =>
        createUiActions({ targets: { registry: targets, enable: ['clearHighlight'] } }),
    });

    const clearHighlight = vi.fn();

    disposers.push(() => integration.dispose());
    integration.targetRegistry.register({
      id: 'card',
      highlight: vi.fn(),
      clearHighlight,
      scrollIntoView: vi.fn(),
    });
    vi.useFakeTimers();
    integration.targetRegistry.highlight('card', 1000);
    clearHighlight.mockClear();
    await integration.assistantClient.requestHostAction('ui.clearHighlight', { targetId: 'card' });
    expect(clearHighlight).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(clearHighlight).toHaveBeenCalledOnce();
    await expect(
      integration.assistantClient.requestHostAction('ui.clearHighlight', { targetId: 'missing' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.TARGET_NOT_FOUND });
  });
});
