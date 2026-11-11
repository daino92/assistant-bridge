import { useEffect } from 'react';

import type { HostIntegration } from '@/create-host-integration';
import type { HostContext } from '@/contracts';
import type { PageCatalog } from '@/host-context';

export type HostPageContextFromCatalogOptions<TKey extends string> = {
  catalog: PageCatalog<TKey>;
  pageKey: TKey;
  selection?: 'clear' | 'preserve';
  /** Omitted entities preserve the current summaries (same as `useHostPageContext`). */
  entities?: NonNullable<HostContext['entities']>;
};

const EMPTY_ENTITIES: NonNullable<HostContext['entities']> = [];

/**
 * Publishes route and page metadata from a {@link PageCatalog} — same as calling
 * `useHostPageContext` with `route: catalog.route(pageKey)` and `page: catalog.pageMeta(pageKey)`.
 */
export const useHostPageContextFromCatalog = <TKey extends string>(
  integration: HostIntegration,
  {
    catalog,
    pageKey,
    selection = 'clear',
    entities = EMPTY_ENTITIES,
  }: HostPageContextFromCatalogOptions<TKey>,
) => {
  useEffect(() => {
    integration.updatePage({
      route: catalog.route(pageKey),
      page: catalog.pageMeta(pageKey),
      selection,
      entities,
    });
  }, [integration, catalog, pageKey, selection, entities]);
};
