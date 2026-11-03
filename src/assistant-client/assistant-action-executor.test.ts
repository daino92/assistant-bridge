import { expect, it, vi } from 'vitest';

import { createAssistantActionExecutor, type AssistantBridgeClient } from '@/assistant-client';
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
  const denied = createAssistantActionExecutor(bridge, { requestConfirmation: async () => false });

  await expect(denied.executeAction('records.updateStatus', args)).rejects.toMatchObject({
    code: 'ACTION_REJECTED',
  });
  expect(dispatch).not.toHaveBeenCalled();

  const allowed = createAssistantActionExecutor(bridge, {
    requestConfirmation: async (request) => {
      expect(request.args).toEqual(args);
      expect(request.entities).toEqual(context.entities);
      args.status = 'active';
      context = { ...context, revision: 2 };

      return true;
    },
  });

  await allowed.executeAction('records.updateStatus', args);
  expect(dispatch).toHaveBeenCalledExactlyOnceWith(
    'records.updateStatus',
    { recordId: 'record-012', status: 'archived' },
    2,
    true,
    expect.any(String),
  );

  const changed = createAssistantActionExecutor(bridge, {
    requestConfirmation: async () => {
      context = { ...context, capabilities: [] };

      return true;
    },
  });

  await expect(changed.executeAction('records.updateStatus', args)).rejects.toThrow('unavailable');
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

  const options = createAssistantActionExecutor(bridge, {
    requestConfirmation: async () => {
      context = { ...context, entities: [] };

      return true;
    },
  });

  await expect(
    options.executeAction('records.updateStatus', { recordId: 'record-012', status: 'archived' }),
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

  const options = createAssistantActionExecutor(bridge, {
    signal: controller.signal,
    requestConfirmation: async () => {
      controller.abort();

      return true;
    },
  });

  await expect(options.executeAction('records.updateStatus', {})).rejects.toThrow();
  expect(dispatch).not.toHaveBeenCalled();
});
