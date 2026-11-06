import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { createHostIntegration } from '@/create-host-integration';
import { definePageCatalog } from '@/host-context';
import { useHostPageContextFromCatalog } from '@/react/hooks/useHostPageContextFromCatalog';

afterEach(cleanup);

it('syncs route and page from catalog like useHostPageContext', () => {
  const catalog = definePageCatalog({
    workspace: { title: 'Workspace', type: 'workspace' },
    dashboard: { title: 'Dashboard', type: 'dashboard' },
  });

  const integration = createHostIntegration({
    destinations: catalog.destinations,
    actions: [],
  });
  const published = vi.fn();

  integration.assistantClient.subscribeContext(published);

  const entity = { type: 'record', id: 'one', label: 'One' };

  const { rerender, unmount } = renderHook(
    ({
      pageKey,
      label,
    }: {
      pageKey: 'workspace' | 'dashboard';
      label: string;
    }) =>
      useHostPageContextFromCatalog(integration, {
        catalog,
        pageKey,
        entities: [{ ...entity, label }],
      }),
    {
      initialProps: { pageKey: 'dashboard' as 'dashboard' | 'workspace', label: 'One' },
    },
  );

  const snap0 = integration.contextManager.getSnapshot();

  expect(snap0.route).toBe('/dashboard');
  expect(snap0.page).toEqual({ title: 'Dashboard', type: 'dashboard' });

  rerender({ pageKey: 'workspace', label: 'One' });
  const snap1 = integration.contextManager.getSnapshot();

  expect(snap1.route).toBe('/workspace');
  expect(snap1.page).toEqual({ title: 'Workspace', type: 'workspace' });

  rerender({ pageKey: 'workspace', label: 'Updated' });
  expect(integration.contextManager.getSnapshot().entities?.[0].label).toBe('Updated');
  unmount();
  integration.bridge.destroy();
});
