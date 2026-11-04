import { describe, expect, it } from 'vitest';

import { definePageCatalog } from '@/host-context/page-catalog';

describe('definePageCatalog', () => {
  const catalog = definePageCatalog({
    workspace: { title: 'Workspace', type: 'workspace' },
    dashboard: { title: 'Dashboard', type: 'dashboard' },
  });

  it('derives destinations and paths from page keys', () => {
    expect(catalog.destinations).toEqual([
      { path: '/workspace', label: 'Workspace' },
      { path: '/dashboard', label: 'Dashboard' },
    ]);
    expect(catalog.paths).toEqual(['/workspace', '/dashboard']);
  });

  it('maps routes and page meta', () => {
    expect(catalog.route('dashboard')).toBe('/dashboard');
    expect(catalog.pageKeyFromRoute('/dashboard')).toBe('dashboard');
    expect(catalog.pageKeyFromRoute('dashboard')).toBeUndefined();
    expect(catalog.pageMeta('dashboard')).toEqual({ title: 'Dashboard', type: 'dashboard' });
  });

  it('checks route and page type against host context', () => {
    const context = {
      route: '/dashboard',
      page: { title: 'Dashboard', type: 'dashboard' },
      capabilities: [],
      revision: 0,
    };

    expect(catalog.isRoute('/dashboard', 'dashboard')).toBe(true);
    expect(catalog.isRoute(context, 'dashboard')).toBe(true);
    expect(catalog.isPageType(context, 'dashboard')).toBe(true);
    expect(catalog.isPageType(context, 'workspace')).toBe(false);
  });
});
