import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

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

describe('definePageCatalog with paths, permissions and parameters', () => {
  const catalog = definePageCatalog({
    dashboard: { title: 'Dashboard', type: 'dashboard' },
    content: {
      title: 'Content',
      type: 'content',
      needs: 'content:read',
      params: z.object({ model: z.uuid().optional() }).strict().optional(),
      paramsDescription: 'Pass params.model to list one model.',
    },
    models: { title: 'Models', type: 'models', needs: 'schema:read', match: 'prefix' },
    newModel: { title: 'New model', type: 'model-new', path: '/models/new', needs: 'schema:write' },
  });

  const reader = { id: 'u', permissions: ['content:read'] };

  it('uses custom paths and prefers exact routes over prefixes', () => {
    expect(catalog.route('newModel')).toBe('/models/new');
    expect(catalog.pageKeyFromRoute('/models/new')).toBe('newModel');
    expect(catalog.pageKeyFromRoute('/models/abc')).toBe('models');
    expect(catalog.pageKeyFromRoute('/modelsx')).toBeUndefined();
    expect(catalog.pageKeyFromRoute('/dashboard')).toBe('dashboard');
  });

  it('filters pages and destinations by the principal', () => {
    expect(catalog.allowed(null)).toEqual(['dashboard']);
    expect(catalog.allowed(reader)).toEqual(['dashboard', 'content']);
    expect(catalog.destinationsFor(reader)).toEqual([
      { path: '/dashboard', label: 'Dashboard' },
      { path: '/content', label: 'Content' },
    ]);
    expect(catalog.destinations).toHaveLength(4);
  });

  it('builds navigateAction options with routes for pages that take parameters', () => {
    const navigate = vi.fn();
    const options = catalog.navigation(reader, { navigate });

    expect(options.allowedRoutes).toEqual(['/dashboard']);
    expect(Object.keys(options.routes ?? {})).toEqual(['/content']);
    expect(options.routes?.['/content'].description).toBe(
      'Content. Pass params.model to list one model.',
    );
    expect(options.navigate).toBe(navigate);
  });
});
