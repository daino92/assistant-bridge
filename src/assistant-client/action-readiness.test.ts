import { afterEach, expect, it, vi } from 'vitest';

import {
  createAssistantActionExecutor,
  defaultActionReadiness,
  waitForHostContext,
  type AssistantBridgeClient,
} from '@/assistant-client';
import type { HostContext } from '@/contracts';

const createBridge = () => {
  let context: HostContext = {
    appId: 'host',
    route: '/',
    page: { title: 'Home', type: 'home' },
    revision: 1,
    capabilities: [
      {
        name: 'custom.open',
        description: 'Open',
        parametersSchema: {},
        requiresConfirmation: false,
      },
    ],
  };

  const listeners = new Set<(context: HostContext) => void>();
  const unsubscribe = vi.fn();

  const bridge: AssistantBridgeClient = {
    getInitialContext: () => context,
    requestHostAction: vi.fn(async () => ({ targetId: 'loaded' })),
    subscribeContext: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
  };

  return {
    bridge,
    unsubscribe,
    publish: (partial: Partial<HostContext>) => {
      context = { ...context, ...partial, revision: context.revision + 1 };
      listeners.forEach((listener) => listener(context));
    },
  };
};

afterEach(() => vi.useRealTimers());

it('waits for custom action targets and a quiet window using the snapshotted args/result', async () => {
  vi.useFakeTimers();

  const { bridge, publish, unsubscribe } = createBridge();
  const finished = vi.fn();
  const args = { path: '/custom' };

  const executor = createAssistantActionExecutor(bridge, {
    contextWait: { timeoutMs: 1000, settleMs: 20 },
    readiness: {
      'custom.open': ({ context, previousContext, args, result }) => {
        expect(previousContext.route).toBe('/');
        expect(args).toEqual({ path: '/custom' });
        expect(result).toEqual({ targetId: 'loaded' });

        return (
          context.route === '/custom' &&
          Boolean(context.targets?.some((target) => target.id === 'loaded'))
        );
      },
    },
  });

  const pending = executor.executeAction('custom.open', args).then(finished);

  args.path = '/changed';
  await vi.advanceTimersByTimeAsync(0);
  publish({ route: '/custom' });
  await vi.advanceTimersByTimeAsync(30);
  expect(finished).not.toHaveBeenCalled();
  publish({ targets: [{ id: 'loaded', label: 'Loaded', actions: ['highlight'] }] });
  await vi.advanceTimersByTimeAsync(10);
  publish({ targets: [] });
  await vi.advanceTimersByTimeAsync(30);
  expect(finished).not.toHaveBeenCalled();
  publish({ targets: [{ id: 'loaded', label: 'Loaded', actions: ['highlight'] }] });
  await vi.advanceTimersByTimeAsync(20);
  await pending;
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(finished).toHaveBeenCalledWith({ targetId: 'loaded' });
});

it('bounds waiting and releases the subscription on timeout', async () => {
  vi.useFakeTimers();

  const { bridge, unsubscribe } = createBridge();
  const pending = waitForHostContext(bridge, () => false, { timeoutMs: 100 });
  const rejected = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });

  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('cleans up when readiness throws, including synchronous subscription notifications', async () => {
  vi.useFakeTimers();

  const { bridge } = createBridge();
  const unsubscribe = vi.fn();

  bridge.subscribeContext = (listener) => {
    listener(bridge.getInitialContext());

    return unsubscribe;
  };

  await expect(
    waitForHostContext(bridge, () => {
      throw new Error('Predicate failed');
    }),
  ).rejects.toThrow('Predicate failed');
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels a pending quiet window and does not subscribe for an already-aborted signal', async () => {
  vi.useFakeTimers();

  const { bridge, unsubscribe } = createBridge();
  const controller = new AbortController();
  const pending = waitForHostContext(bridge, () => true, { signal: controller.signal });
  const rejected = expect(pending).rejects.toThrow();

  controller.abort();
  await rejected;
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);

  const subscribe = vi.spyOn(bridge, 'subscribeContext');

  await expect(
    waitForHostContext(bridge, () => true, { signal: controller.signal }),
  ).rejects.toThrow();
  expect(subscribe).not.toHaveBeenCalled();
});

it('does not treat an unrelated route as completed detail navigation', () => {
  const { bridge } = createBridge();

  const state = {
    context: { ...bridge.getInitialContext(), route: '/other' },
    previousContext: bridge.getInitialContext(),
    args: { id: 'record-012' },
    result: {},
  };

  expect(defaultActionReadiness['ui.openDetails'](state)).toBe(false);
  expect(
    defaultActionReadiness['ui.openDetails']({
      ...state,
      context: { ...state.context, route: '/records/record-012' },
    }),
  ).toBe(true);
});
