import { expect, it, vi } from 'vitest';
import { z } from 'zod';

import { HostContextManager } from '@/host-context';
import { createHostIntegration } from '@/create-host-integration';
import type { HostContext } from '@/contracts';

const INITIAL: Omit<HostContext, 'revision'> = {
  route: '/',
  page: { title: 'Home', type: 'home' },
  capabilities: [
    {
      name: 'test',
      description: 'Test',
      requiresConfirmation: false,
      parametersSchema: { type: 'object', properties: { id: { type: 'string' } } },
    },
  ],
  destinations: [{ path: '/records', label: 'Records' }],
  targets: [{ id: 'one', label: 'One', actions: ['highlight'] }],
  entities: [
    {
      type: 'record',
      id: 'one',
      label: 'One',
      aliases: ['First'],
      attributes: { status: 'active' },
    },
  ],
  selection: { type: 'record', id: 'one' },
};

it('isolates all nested inputs, snapshots and subscriber values', () => {
  const input = structuredClone(INITIAL);
  const manager = new HostContextManager(input);

  input.page.title = 'MUTATED';
  input.destinations![0].label = 'MUTATED';
  input.capabilities[0].parametersSchema.type = 'MUTATED';

  const snapshot = manager.getSnapshot();

  expect(snapshot.page.title).toBe('Home');
  expect(snapshot.destinations![0].label).toBe('Records');
  snapshot.page.title = 'MUTATED';
  snapshot.selection!.id = 'MUTATED';
  snapshot.capabilities[0].parametersSchema.type = 'MUTATED';
  snapshot.targets![0].actions.push('focus');
  snapshot.entities![0].aliases!.push('MUTATED');
  expect(manager.getSnapshot()).toEqual({ ...INITIAL, revision: 0 });
  manager.subscribe((value) => {
    value.page.title = 'MUTATED';
    value.entities![0].attributes!.status = 'MUTATED';
  });

  const listener = vi.fn();

  manager.subscribe(listener);

  const entities = structuredClone(INITIAL.entities!);

  entities[0].attributes!.status = 'pending';
  manager.setEntities(entities);
  entities[0].attributes!.status = 'MUTATED';
  expect(listener.mock.calls[0][0].entities[0].attributes.status).toBe('pending');
  expect(listener.mock.calls[0][0].page.title).toBe('Home');
  expect(manager.getSnapshot().entities![0].attributes!.status).toBe('pending');
});

it('does not bump revisions or notify for equal values, including JSON key order', () => {
  const manager = new HostContextManager(INITIAL);
  const listener = vi.fn();

  manager.subscribe(listener);
  manager.setRoute('/', { type: 'home', title: 'Home' });
  manager.setSelection({ id: 'one', type: 'record' });
  manager.setEntities(structuredClone(INITIAL.entities!));
  manager.setTargets(structuredClone(INITIAL.targets!));
  manager.setCapabilities(structuredClone(INITIAL.capabilities));
  expect(manager.getSnapshot().revision).toBe(0);
  expect(listener).not.toHaveBeenCalled();
  manager.clearSelection();
  manager.clearSelection();
  expect(manager.getSnapshot().revision).toBe(1);
  expect(listener).toHaveBeenCalledOnce();
});

it('publishes route, selection, entities and derived availability as one coherent revision', () => {
  const integration = createHostIntegration({
    actions: [
      {
        name: 'records.test',
        description: 'Records',
        schema: z.object({}),
        available: (context) => context.route === '/records' && context.entities?.[0]?.id === 'two',
        handler: () => null,
      },
    ],
  });

  integration.contextManager.setSelection({ type: 'record', id: 'old' });

  const previousRevision = integration.contextManager.getSnapshot().revision;
  const listener = vi.fn();

  integration.assistantClient.subscribeContext(listener);
  integration.updatePage({
    route: '/records',
    page: { title: 'Records', type: 'records' },
    entities: [{ type: 'record', id: 'two', label: 'Two' }],
  });
  expect(listener).toHaveBeenCalledOnce();
  expect(listener.mock.calls[0][0]).toMatchObject({
    route: '/records',
    revision: previousRevision + 1,
    entities: [{ id: 'two' }],
    capabilities: [{ name: 'records.test' }],
  });
  expect(listener.mock.calls[0][0].selection).toBeUndefined();
  integration.updatePage({
    route: '/records',
    page: { title: 'Records', type: 'records' },
    entities: [{ type: 'record', id: 'two', label: 'Two' }],
  });
  expect(listener).toHaveBeenCalledOnce();
  integration.dispose();
});

it('does not clear selection or highlights for an entity-only update outside React', () => {
  const integration = createHostIntegration({ actions: [] });

  integration.updatePage({ route: '/records', page: { title: 'Records', type: 'records' } });
  integration.contextManager.setSelection({ type: 'record', id: 'one' });

  const clearHighlight = vi.fn();

  integration.targetRegistry.register({
    id: 'one',
    highlight: vi.fn(),
    clearHighlight,
    scrollIntoView: vi.fn(),
  });
  integration.targetRegistry.highlight('one');
  clearHighlight.mockClear();
  integration.updatePage({
    route: '/records',
    page: { title: 'Records', type: 'records' },
    entities: [{ type: 'record', id: 'one', label: 'Updated' }],
  });
  expect(clearHighlight).not.toHaveBeenCalled();
  expect(integration.contextManager.getSnapshot().selection?.id).toBe('one');
  integration.dispose();
});

it('delivers reentrant updates in revision order without sharing snapshots', () => {
  const manager = new HostContextManager(INITIAL);
  const observed: number[] = [];

  manager.subscribe((context) => {
    if (context.revision === 1) {
      manager.setSelection({ type: 'record', id: 'next' });
    }
  });
  manager.subscribe((context) => observed.push(context.revision));
  manager.setRoute('/records', { title: 'Records', type: 'records' });
  expect(observed).toEqual([1, 2]);
});

it('keeps page policy consistent when a subscriber synchronously navigates again', () => {
  const manager = new HostContextManager(INITIAL);

  manager.subscribe((context) => {
    if (context.route === '/first') {
      manager.updatePage({
        route: '/second',
        page: { title: 'Second', type: 'detail' },
        selection: 'preserve',
      });
    }
  });
  manager.updatePage({
    route: '/first',
    page: { title: 'First', type: 'detail' },
    selection: 'preserve',
  });

  const revision = manager.getSnapshot().revision;

  expect(
    manager.updatePage({
      route: '/second',
      page: { title: 'Second', type: 'detail' },
      selection: 'preserve',
    }),
  ).toBe(false);
  expect(manager.getSnapshot().revision).toBe(revision);
  expect(manager.getSnapshot().selection?.id).toBe('one');
});

it('isolates context notifications between direct assistant clients', () => {
  const integration = createHostIntegration({ actions: [] });
  const listener = vi.fn();

  integration.assistantClient.subscribeContext((context) => {
    context.page.title = 'MUTATED';
  });
  integration.assistantClient.subscribeContext(listener);
  integration.updatePage({ route: '/records', page: { title: 'Records', type: 'records' } });
  expect(listener.mock.calls[0][0].page.title).toBe('Records');
  expect(integration.assistantClient.getInitialContext().page.title).toBe('Records');
  integration.dispose();
});
