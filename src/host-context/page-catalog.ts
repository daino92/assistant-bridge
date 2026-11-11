import type { HostContext } from '@/contracts';

export type PageCatalogEntry = {
  title: string;
  type: string;
};

export type PageCatalogDefinition<TKey extends string> = Record<TKey, PageCatalogEntry>;

export interface PageCatalog<TKey extends string> {
  readonly pages: PageCatalogDefinition<TKey>;
  readonly destinations: NonNullable<HostContext['destinations']>;
  readonly paths: readonly string[];
  route(pageKey: TKey): string;
  pageKeyFromRoute(route: string): TKey | undefined;
  pageMeta(pageKey: TKey): HostContext['page'];
  isRoute(routeOrContext: string | HostContext, pageKey: TKey): boolean;
  isPageType(context: HostContext, pageKey: TKey): boolean;
}

export const definePageCatalog = <TKey extends string>(
  definition: PageCatalogDefinition<TKey>,
): PageCatalog<TKey> => {
  const pages = definition;
  const keys = Object.keys(definition) as TKey[];

  const destinations = keys.map((key) => ({
    path: `/${key}`,
    label: pages[key].title,
  }));

  const paths = destinations.map((destination) => destination.path);

  const route = (pageKey: TKey): string => `/${pageKey}`;

  const pageKeyFromRoute = (routePath: string): TKey | undefined => {
    if (!routePath.startsWith('/')) {
      return undefined;
    }

    const key = routePath.slice(1) as TKey;

    return Object.hasOwn(pages, key) ? key : undefined;
  };

  const pageMeta = (pageKey: TKey): HostContext['page'] => ({
    title: pages[pageKey].title,
    type: pages[pageKey].type,
  });

  const isRoute = (routeOrContext: string | HostContext, pageKey: TKey): boolean => {
    const expected = route(pageKey);

    if (typeof routeOrContext === 'string') {
      return routeOrContext === expected;
    }

    return routeOrContext.route === expected;
  };

  const isPageType = (context: HostContext, pageKey: TKey): boolean =>
    context.page.type === pages[pageKey].type;

  return {
    pages,
    destinations,
    paths,
    route,
    pageKeyFromRoute,
    pageMeta,
    isRoute,
    isPageType,
  };
};
