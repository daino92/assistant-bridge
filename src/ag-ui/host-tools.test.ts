import { expect, it, vi } from 'vitest';

import { createHostAgentOptions } from '@/ag-ui';
import type { AssistantBridgeClient } from '@/assistant-client';
import type { HostContext } from '@/contracts';

it('requires explicit approval, snapshots arguments and rechecks permissions before dispatch', async () => {
  let context: HostContext = {
    route: '/records',
    page: { title: 'Records', type: 'records' },
    revision: 1,
    entities: [
      {
        type: 'record',
        id: 'record-012',
        label: 'Initiative M-12',
        attributes: { status: 'active' },
      },
    ],
    capabilities: [
      {
        name: 'records.updateStatus',
        description: 'Update status',
        parametersSchema: {},
        requiresConfirmation: true,
      },
    ],
  };

  const dispatch = vi.fn(async () => ({ status: 'archived' }));

  const bridge: AssistantBridgeClient = {
    getInitialContext: () => context,
    subscribeContext: () => () => {},
    requestHostAction: dispatch,
  };

  const args = { recordId: 'record-012', status: 'archived' };
  const denied = createHostAgentOptions(bridge, { requestConfirmation: async () => false });

  await expect(denied.executeTool('records.updateStatus', args)).rejects.toMatchObject({
    code: 'ACTION_REJECTED',
  });
  expect(dispatch).not.toHaveBeenCalled();

  const allowed = createHostAgentOptions(bridge, {
    requestConfirmation: async (request) => {
      expect(request.args).toEqual(args);
      expect(request.entities).toEqual(context.entities);
      args.status = 'active';
      context = { ...context, revision: 2 };

      return true;
    },
  });

  await allowed.executeTool('records.updateStatus', args);
  expect(dispatch).toHaveBeenCalledExactlyOnceWith(
    'records.updateStatus',
    { recordId: 'record-012', status: 'archived' },
    2,
    true,
    expect.any(String),
  );

  const changed = createHostAgentOptions(bridge, {
    requestConfirmation: async () => {
      context = { ...context, capabilities: [] };

      return true;
    },
  });

  await expect(changed.executeTool('records.updateStatus', args)).rejects.toThrow('unavailable');
  expect(dispatch).toHaveBeenCalledTimes(1);
});

it('refuses approval if business entity context changes while the card is open', async () => {
  let context: HostContext = {
    route: '/records',
    page: { title: 'Records', type: 'records' },
    revision: 1,
    capabilities: [
      {
        name: 'records.updateStatus',
        description: 'Update',
        parametersSchema: {},
        requiresConfirmation: true,
      },
    ],
    entities: [
      {
        type: 'record',
        id: 'record-012',
        label: 'Initiative M-12',
        attributes: { status: 'active' },
      },
    ],
  };

  const dispatch = vi.fn();

  const bridge: AssistantBridgeClient = {
    getInitialContext: () => context,
    subscribeContext: () => () => {},
    requestHostAction: dispatch,
  };

  const options = createHostAgentOptions(bridge, {
    requestConfirmation: async () => {
      context = { ...context, entities: [] };

      return true;
    },
  });

  expect(JSON.parse(options.context[0]!.value).entities[0]).toMatchObject({
    id: 'record-012',
    label: 'Initiative M-12',
  });
  await expect(
    options.executeTool('records.updateStatus', { recordId: 'record-012', status: 'archived' }),
  ).rejects.toMatchObject({ code: 'STALE_CONTEXT' });
  expect(dispatch).not.toHaveBeenCalled();
});

it('does not dispatch when a run stops while approval is pending', async () => {
  const controller = new AbortController();
  const dispatch = vi.fn();

  const context: HostContext = {
    route: '/records',
    page: { title: 'Records', type: 'records' },
    revision: 1,
    capabilities: [
      {
        name: 'records.updateStatus',
        description: 'Update',
        parametersSchema: {},
        requiresConfirmation: true,
      },
    ],
  };

  const bridge: AssistantBridgeClient = {
    getInitialContext: () => context,
    subscribeContext: () => () => {},
    requestHostAction: dispatch,
  };

  const options = createHostAgentOptions(bridge, {
    signal: controller.signal,
    requestConfirmation: async () => {
      controller.abort();

      return true;
    },
  });

  await expect(options.executeTool('records.updateStatus', {})).rejects.toThrow();
  expect(dispatch).not.toHaveBeenCalled();
});

it('advertises only non-confirmation tools and rechecks current permissions/revision before dispatch', async () => {
  let context: HostContext = {
    route: '/',
    page: { title: 'Dashboard', type: 'dashboard' },
    revision: 1,
    capabilities: [
      {
        name: 'ui.navigate',
        description: 'Navigate',
        parametersSchema: { type: 'object' },
        requiresConfirmation: false,
      },
      {
        name: 'records.delete',
        description: 'Delete',
        parametersSchema: { type: 'object' },
        requiresConfirmation: true,
      },
    ],
  };

  const requestHostAction = vi.fn(async () => {
    context = { ...context, route: '/records' };

    return { ok: true };
  });

  const bridge: AssistantBridgeClient = {
    getInitialContext: () => context,
    subscribeContext: () => () => {},
    requestHostAction,
  };

  const options = createHostAgentOptions(bridge);

  expect(options.tools.map((tool) => tool.name)).toEqual(['ui.navigate']);
  context = { ...context, revision: 2 };
  await options.executeTool('ui.navigate', { path: '/records' });
  expect(requestHostAction).toHaveBeenCalledExactlyOnceWith(
    'ui.navigate',
    { path: '/records' },
    2,
    undefined,
    expect.any(String),
  );
  await expect(options.executeTool('records.delete', {})).rejects.toThrow('unavailable');
  context = { ...context, capabilities: [], revision: 3 };
  await expect(options.executeTool('ui.navigate', {})).rejects.toThrow('unavailable');
  expect(requestHostAction).toHaveBeenCalledTimes(1);
});

it('keeps standalone agents free of host tools and rejects host dispatch', async () => {
  const options = createHostAgentOptions();

  expect(options.tools).toEqual([]);
  expect(options.context).toEqual([]);
  await expect(options.executeTool('ui.navigate', {})).rejects.toThrow('unavailable');
});

it('waits for the destination context and publishes its targets, destinations and current tools', async () => {
  let context: HostContext = {
    route: '/',
    page: { title: 'Dashboard', type: 'dashboard' },
    revision: 1,
    destinations: [{ path: '/records', label: 'Enterprise records' }],
    targets: [{ id: 'revenue', label: 'Revenue pipeline', actions: ['highlight'] }],
    capabilities: [
      {
        name: 'ui.navigate',
        description: 'Navigate',
        parametersSchema: {},
        requiresConfirmation: false,
      },
    ],
  };

  let listener: ((context: HostContext) => void) | undefined;
  const unsubscribe = vi.fn();

  const bridge: AssistantBridgeClient = {
    getInitialContext: () => context,
    subscribeContext: (callback) => {
      listener = callback;

      return unsubscribe;
    },
    requestHostAction: async () => {
      return { path: '/records' };
    },
  };

  const options = createHostAgentOptions(bridge);
  const pending = options.executeTool('ui.navigate', { path: '/records' });

  await vi.waitFor(() => expect(listener).toBeDefined());
  context = {
    ...context,
    route: '/records',
    revision: 2,
    targets: [{ id: 'records.table', label: 'Records table', actions: ['highlight'] }],
    capabilities: [
      {
        name: 'records.filter',
        description: 'Filter',
        parametersSchema: {},
        requiresConfirmation: false,
      },
    ],
  };
  listener?.(context);
  await pending;
  expect(options.getHostState().tools.map((tool) => tool.name)).toEqual(['records.filter']);
  expect(JSON.parse(options.getHostState().context[0].value)).toMatchObject({
    route: '/records',
    targets: [{ id: 'records.table', label: 'Records table' }],
    destinations: [{ path: '/records' }],
  });
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it('cleans up a pending navigation context subscription on cancellation', async () => {
  const controller = new AbortController();
  const unsubscribe = vi.fn();

  const bridge: AssistantBridgeClient = {
    getInitialContext: () => ({
      route: '/',
      page: { title: 'Dashboard', type: 'dashboard' },
      revision: 1,
      capabilities: [
        {
          name: 'ui.navigate',
          description: 'Navigate',
          parametersSchema: {},
          requiresConfirmation: false,
        },
      ],
    }),
    subscribeContext: vi.fn(() => unsubscribe),
    requestHostAction: async () => ({ path: '/records' }),
  };

  const pending = createHostAgentOptions(bridge, { signal: controller.signal }).executeTool(
    'ui.navigate',
    { path: '/records' },
  );

  const rejection = expect(pending).rejects.toThrow();

  await vi.waitFor(() => expect(bridge.subscribeContext).toHaveBeenCalledOnce());
  controller.abort();
  await rejection;
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it('fails with a bounded timeout when navigation does not publish the destination context', async () => {
  vi.useFakeTimers();

  const unsubscribe = vi.fn();

  const bridge: AssistantBridgeClient = {
    getInitialContext: () => ({
      route: '/',
      page: { title: 'Dashboard', type: 'dashboard' },
      revision: 1,
      capabilities: [
        {
          name: 'ui.navigate',
          description: 'Navigate',
          parametersSchema: {},
          requiresConfirmation: false,
        },
      ],
    }),
    subscribeContext: () => unsubscribe,
    requestHostAction: async () => ({ path: '/records' }),
  };

  try {
    const pending = createHostAgentOptions(bridge).executeTool('ui.navigate', { path: '/records' });
    const rejection = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });

    await vi.advanceTimersByTimeAsync(3000);
    await rejection;
    expect(unsubscribe).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
