import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createHostIntegration } from '@/create-host-integration';
import { useHostPageContext } from '@/react/hooks';

afterEach(cleanup);

it('syncs page and entities without clearing selection on data-only updates or equivalent renders', () => {
  const integration = createHostIntegration({ actions: [] });
  const published = vi.fn();

  integration.assistantClient.subscribeContext(published);

  const entity = { type: 'record', id: 'one', label: 'One' };

  const { rerender, unmount } = renderHook(
    ({
      label,
      route,
      selection,
    }: {
      label: string;
      route: string;
      selection: 'clear' | 'preserve';
    }) =>
      useHostPageContext(integration, {
        route,
        page: { title: 'Records', type: 'records' },
        selection,
        entities: [{ ...entity, label }],
      }),
    { initialProps: { label: 'One', route: '/records', selection: 'clear' } },
  );

  integration.contextManager.setSelection({ type: 'record', id: 'one' });

  const revision = integration.contextManager.getSnapshot().revision;
  const notifications = published.mock.calls.length;

  rerender({ label: 'One', route: '/records', selection: 'clear' });
  expect(published).toHaveBeenCalledTimes(notifications);
  expect(integration.contextManager.getSnapshot().revision).toBe(revision);
  rerender({ label: 'Updated', route: '/records', selection: 'clear' });
  expect(published).toHaveBeenCalledTimes(notifications + 1);
  expect(integration.contextManager.getSnapshot().revision).toBe(revision + 1);
  expect(integration.contextManager.getSnapshot().selection?.id).toBe('one');
  expect(integration.contextManager.getSnapshot().entities?.[0].label).toBe('Updated');
  rerender({ label: 'Updated', route: '/records/one', selection: 'preserve' });
  expect(integration.contextManager.getSnapshot().selection?.id).toBe('one');
  rerender({ label: 'Updated', route: '/', selection: 'clear' });
  expect(integration.contextManager.getSnapshot().selection).toBeUndefined();
  unmount();
  integration.bridge.destroy();
});

it('publishes destinations that change while the integration stays mounted', () => {
  const integration = createHostIntegration({
    actions: [],
    destinations: [{ path: '/records', label: 'Records' }],
  });

  const page = { title: 'Records', type: 'records' };

  const { rerender, unmount } = renderHook(
    ({ destinations }: { destinations: { path: string; label: string }[] }) =>
      useHostPageContext(integration, { route: '/records', page, destinations }),
    { initialProps: { destinations: [{ path: '/records', label: 'Records' }] } },
  );

  rerender({ destinations: [{ path: '/settings', label: 'Settings' }] });
  expect(integration.contextManager.getSnapshot().destinations).toEqual([
    { path: '/settings', label: 'Settings' },
  ]);
  unmount();
  integration.dispose();
});
