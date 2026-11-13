import type { HostContext, HostPrincipal } from '@/contracts';
import type { NavigateActionOptions, NavigateRoute } from '@/actions';

export type PageCatalogEntry = {
  title: string;
  type: string;
  /** Route of the page. Defaults to `/<key>`. */
  path?: string;
  /**
   * `exact` (default) matches only `path`; `prefix` also matches sub-routes such as
   * `/models/<id>`. Navigation always targets `path` itself.
   */
  match?: 'exact' | 'prefix';
  /**
   * Permission the principal needs for this page. Pages without `needs` are always allowed.
   * This only hides pages from the assistant; the host and backend still authorize.
   */
  needs?: string;
  /** Query parameters `ui.navigate` may pass for this page, validated before `navigate`. */
  params?: NavigateRoute['params'];
  /** Hint for the assistant about `params`, for example "Pass params.model to filter". */
  paramsDescription?: string;
};

export type PageCatalogDefinition<TKey extends string> = Record<TKey, PageCatalogEntry>;

export interface PageCatalog<TKey extends string> {
  readonly pages: PageCatalogDefinition<TKey>;
  /** Every page, regardless of permissions. Prefer {@link PageCatalog.destinationsFor}. */
  readonly destinations: NonNullable<HostContext['destinations']>;
  readonly paths: readonly string[];
  route(pageKey: TKey): string;
  pageKeyFromRoute(route: string): TKey | undefined;
  pageMeta(pageKey: TKey): HostContext['page'];
  isRoute(routeOrContext: string | HostContext, pageKey: TKey): boolean;
  isPageType(context: HostContext, pageKey: TKey): boolean;
  /** Page keys the principal may open, in catalog order. */
  allowed(principal?: HostPrincipal | null): TKey[];
  /** Destinations for the principal, for `updatePage({ destinations })`. */
  destinationsFor(principal?: HostPrincipal | null): NonNullable<HostContext['destinations']>;
  /**
   * `navigateAction` options for the principal: pages without `params` become
   * `allowedRoutes`, pages with `params` become `routes`.
   */
  navigation(
    principal: HostPrincipal | null | undefined,
    options: Pick<NavigateActionOptions, 'navigate' | 'beforeNavigate' | 'detailPattern'>,
  ): NavigateActionOptions;
}

export const definePageCatalog = <TKey extends string>(
  definition: PageCatalogDefinition<TKey>,
): PageCatalog<TKey> => {
  const pages = definition;
  const keys = Object.keys(definition) as TKey[];

  const route = (pageKey: TKey): string => pages[pageKey].path ?? `/${pageKey}`;

  const destination = (key: TKey) => ({ path: route(key), label: pages[key].title });

  const destinations = keys.map(destination);

  const paths = destinations.map((item) => item.path);

  const matches = (key: TKey, routePath: string): boolean => {
    const path = route(key);

    if (routePath === path) {
      return true;
    }

    return pages[key].match === 'prefix' && routePath.startsWith(`${path}/`);
  };

  // Exact matches win over prefixes, so `/models` and `/models/new` can be different pages.
  const pageKeyFromRoute = (routePath: string): TKey | undefined => {
    if (!routePath.startsWith('/')) {
      return undefined;
    }

    return (
      keys.find((key) => route(key) === routePath) ?? keys.find((key) => matches(key, routePath))
    );
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

  const allowed = (principal?: HostPrincipal | null): TKey[] =>
    keys.filter((key) => {
      const { needs } = pages[key];

      return needs === undefined || (principal?.permissions.includes(needs) ?? false);
    });

  const destinationsFor = (principal?: HostPrincipal | null) => allowed(principal).map(destination);

  const navigation: PageCatalog<TKey>['navigation'] = (principal, options) => {
    const allowedRoutes: string[] = [];
    const routes: Record<string, NavigateRoute> = {};

    for (const key of allowed(principal)) {
      const { params, paramsDescription, title } = pages[key];

      if (params) {
        routes[route(key)] = {
          params,
          description: paramsDescription ? `${title}. ${paramsDescription}` : title,
        };
      } else {
        allowedRoutes.push(route(key));
      }
    }

    return { ...options, allowedRoutes, routes };
  };

  return {
    pages,
    destinations,
    paths,
    route,
    pageKeyFromRoute,
    pageMeta,
    isRoute,
    isPageType,
    allowed,
    destinationsFor,
    navigation,
  };
};
