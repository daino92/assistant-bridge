import { describe, expect, it } from 'vitest';

import { definePageCatalog } from '@/host-context/page-catalog';
import { emptyPayloadSchema, whenPageType, whenPageTypeAnd } from '@/host-context/action-kit';

describe('action-kit', () => {
  const catalog = definePageCatalog({
    a: { title: 'A', type: 'ta' },
    b: { title: 'B', type: 'tb' },
  });

  const ctxA = {
    route: '/a',
    page: { title: 'A', type: 'ta' },
    revision: 0,
    capabilities: [],
  };

  const ctxB = {
    route: '/b',
    page: { title: 'B', type: 'tb' },
    revision: 0,
    capabilities: [],
  };

  it('emptyPayloadSchema accepts {}', () => {
    expect(emptyPayloadSchema.parse({})).toEqual({});
  });

  it('whenPageType matches catalog page types', () => {
    expect(whenPageType(catalog, 'a')(ctxA)).toBe(true);
    expect(whenPageType(catalog, 'a')(ctxB)).toBe(false);
  });

  it('whenPageTypeAnd requires page match and host predicate', () => {
    const host = { ok: true };

    expect(whenPageTypeAnd(catalog, 'a', host, (h) => h.ok)(ctxA)).toBe(true);
    expect(whenPageTypeAnd(catalog, 'a', { ok: false }, (h) => h.ok)(ctxA)).toBe(false);
    expect(whenPageTypeAnd(catalog, 'a', host, (h) => h.ok)(ctxB)).toBe(false);
  });
});
