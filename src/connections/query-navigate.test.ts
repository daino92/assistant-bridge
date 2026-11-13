import { expect, it, vi } from 'vitest';

import { queryNavigate } from '@/connections';

it('keeps the base query, adds parameters, drops empty values and never overrides the base', () => {
  const navigate = vi.fn((url: string) => url);
  const go = queryNavigate(navigate, { environment: 'env 1' });

  expect(go('/content', { model: 'm', entry: undefined, page: 2, flag: null })).toBe(
    '/content?environment=env+1&model=m&page=2',
  );
  expect(queryNavigate(navigate)('/media')).toBe('/media');
  expect(go('/content', { environment: 'other' })).toBe('/content?environment=env+1');
});
