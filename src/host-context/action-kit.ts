import { z } from 'zod';

import type { HostContext } from '@/contracts';

import type { PageCatalog } from './page-catalog';

/** Standard Zod schema for host actions that accept an empty JSON object. */
export const emptyPayloadSchema = z.object({});

/**
 * `available` predicate: current published page matches the catalog entry for `pageKey`
 * (via {@link PageCatalog.isPageType}).
 */
export const whenPageType =
  <TKey extends string>(catalog: PageCatalog<TKey>, pageKey: TKey) =>
  (ctx: HostContext): boolean =>
    catalog.isPageType(ctx, pageKey);

/**
 * Combines {@link whenPageType} with host-owned live state (workspace, selection, router extras)
 * that is not mirrored in {@link HostContext}. The `when` callback closes over that state.
 */
export const whenPageTypeAnd =
  <TKey extends string, H>(
    catalog: PageCatalog<TKey>,
    pageKey: TKey,
    host: H,
    when: (state: H) => boolean,
  ): ((ctx: HostContext) => boolean) =>
  (ctx) =>
    whenPageType(catalog, pageKey)(ctx) && when(host);
