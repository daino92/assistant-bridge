import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ERROR_CODES } from '@/contracts';
import { connectEmbeddedAssistant } from '@/connections';
import { attachAssistantCommandHandler, waitForHostContext } from '@/assistant-client';
import { createHostIntegration } from './create-host-integration';

describe('createHostIntegration', () => {
  it('updates page context, clears highlights and applies the explicit selection policy', () => {
    const integration = createHostIntegration({ actions: [] });
    const clearHighlight = vi.fn();

    integration.targetRegistry.register({
      id: 'item',
      highlight: vi.fn(),
      clearHighlight,
      scrollIntoView: vi.fn(),
    });
    integration.targetRegistry.highlight('item');
    clearHighlight.mockClear();

    const selection = { type: 'catalog', id: 'item' };

    integration.contextManager.setSelection(selection);

    const published = vi.fn();

    integration.assistantClient.subscribeContext(published);

    integration.updatePage({
      route: '/catalog/item',
      page: { title: 'Item', type: 'detail' },
      selection: 'preserve',
    });
    expect(integration.contextManager.getSnapshot()).toMatchObject({
      route: '/catalog/item',
      selection,
    });
    expect(clearHighlight).toHaveBeenCalledOnce();
    expect(published).toHaveBeenCalledOnce();
    integration.updatePage({ route: '/', page: { title: 'Home', type: 'home' } });
    expect(integration.contextManager.getSnapshot().selection).toBeUndefined();
    integration.bridge.destroy();
  });
  it('runs only the actions supplied by the host', async () => {
    const navigate = vi.fn();

    const integration = createHostIntegration({
      actions: [
        {
          name: 'ui.navigate',
          description: 'Navigate',
          schema: z.object({ path: z.string() }),
          handler({ path }) {
            navigate(path);

            return { path };
          },
        },
      ],
    });

    integration.bridge.notifyAssistantReady('assistant');

    const result = await integration.bridge.requestHostAction('ui.navigate', { path: '/catalog' });

    expect(result).toEqual({ path: '/catalog' });
    expect(navigate).toHaveBeenCalledWith('/catalog');

    const missing = await integration.actionRegistry.execute(
      'records.filter',
      {},
      {
        getContext: () => integration.contextManager.getSnapshot(),
      },
    );

    expect(missing.success).toBe(false);

    if (!missing.success) {
      expect(missing.error.code).toBe(ERROR_CODES.UNKNOWN_ACTION);
    }
  });
});

it('publishes named targets and destinations while limiting capabilities to the current page', () => {
  const integration = createHostIntegration({
    destinations: [{ path: '/records', label: 'Records' }],
    actions: [
      {
        name: 'records.filter',
        description: 'Filter records',
        schema: z.object({}),
        available: (ctx) => ctx.route === '/records',
        handler: () => ({}),
      },
    ],
  });

  expect(integration.contextManager.getSnapshot().capabilities).toEqual([]);

  const unregister = integration.targetRegistry.register({
    id: 'revenue',
    label: 'Revenue pipeline',
    highlight: vi.fn(),
    clearHighlight: vi.fn(),
    scrollIntoView: vi.fn(),
  });

  expect(integration.contextManager.getSnapshot()).toMatchObject({
    targets: [{ id: 'revenue', label: 'Revenue pipeline', actions: ['highlight', 'clearHighlight', 'scrollTo'] }],
    destinations: [{ path: '/records', label: 'Records' }],
  });
  unregister();
  expect(integration.contextManager.getSnapshot().targets).toEqual([]);
  integration.updatePage({ route: '/records', page: { title: 'Records', type: 'records' } });
  expect(integration.contextManager.getSnapshot().capabilities.map((item) => item.name)).toEqual([
    'records.filter',
  ]);
  integration.bridge.destroy();
});

it('disposes once, clears target timers/listeners and refuses reuse', async () => {
  vi.useFakeTimers();

  const integration = createHostIntegration({ actions: [] });
  const clearHighlight = vi.fn();
  const listener = vi.fn();

  integration.targetRegistry.register({
    id: 'target',
    highlight: vi.fn(),
    clearHighlight,
    scrollIntoView: vi.fn(),
  });
  integration.targetRegistry.highlight('target', 10000);
  clearHighlight.mockClear();
  integration.contextManager.subscribe(listener);

  const context = integration.contextManager.getSnapshot();

  try {
    integration.dispose();
    integration.dispose();
    expect(clearHighlight).toHaveBeenCalledOnce();
    expect(integration.targetRegistry.listIds()).toEqual([]);
    expect(integration.bridge.signal.aborted).toBe(true);
    expect(integration.bridge.bus.listenerCount('host.action.request')).toBe(0);
    integration.contextManager.setSelection({ type: 'record', id: 'one' });
    integration.targetRegistry.register({
      id: 'late',
      highlight: vi.fn(),
      clearHighlight,
      scrollIntoView: vi.fn(),
    });
    expect(integration.contextManager.getSnapshot()).toEqual(context);
    expect(listener).not.toHaveBeenCalled();
    expect(integration.targetRegistry.listIds()).toEqual([]);
    expect(() =>
      integration.updatePage({ route: '/late', page: { title: 'Late', type: 'test' } }),
    ).toThrow();
    await expect(
      integration.assistantClient.requestHostAction('anything', {}),
    ).rejects.toMatchObject({ code: 'RECEIVER_UNAVAILABLE' });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    integration.dispose();
    vi.useRealTimers();
  }
});

it('rejects pending actions, commands and readiness waits immediately on disposal', async () => {
  const integration = createHostIntegration({
    actions: [
      {
        name: 'pending',
        description: 'Pending',
        schema: z.object({}),
        handler: () => new Promise(() => {}),
      },
    ],
  });

  const detach = attachAssistantCommandHandler(integration.bridge, () => new Promise(() => {}));

  integration.bridge.notifyAssistantReady('test');

  const action = expect(
    integration.assistantClient.requestHostAction('pending', {}),
  ).rejects.toMatchObject({ code: 'RECEIVER_UNAVAILABLE' });

  const command = expect(integration.assistantCommands.open()).rejects.toMatchObject({
    code: 'RECEIVER_UNAVAILABLE',
  });

  const readiness = expect(
    waitForHostContext(integration.assistantClient, () => false),
  ).rejects.toMatchObject({ code: 'RECEIVER_UNAVAILABLE' });

  integration.dispose();
  await Promise.all([action, command, readiness]);
  detach();
});

it('closes owned embedded connections and cancels loading deadlines', async () => {
  vi.useFakeTimers();

  const integration = createHostIntegration({ actions: [] });
  const onStatus = vi.fn();
  const connection = connectEmbeddedAssistant(integration, { onStatus, timeoutMs: 100 });

  try {
    integration.dispose();
    await connection.closed;
    expect(connection.isActive()).toBe(false);

    const statusCount = onStatus.mock.calls.length;

    connection.onReady(() => 'late');
    await vi.advanceTimersByTimeAsync(200);
    expect(onStatus).toHaveBeenCalledTimes(statusCount);
    expect(integration.bridge.isAssistantAvailable()).toBe(false);
    expect(() => connectEmbeddedAssistant(integration, { onStatus })).toThrow();
    connection.dispose();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    integration.dispose();
    vi.useRealTimers();
  }
});
