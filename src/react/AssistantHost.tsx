import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  navigateAction,
  type HostActionInput,
  type NavigateActionOptions,
  type NavigateParams,
} from '@/actions';
import type { AskOptions, EmbeddedAssistantOptions } from '@/assistant-client';
import type { UiTargetRegistry } from '@/capabilities';
import { connectEmbeddedAssistant } from '@/connections';
import {
  ERROR_CODES,
  type HostContext,
  type HostPrincipal,
  type IntegrationTimelineEntry,
} from '@/contracts';
import { createIntegrationError } from '@/errors';
import type { PageCatalog } from '@/host-context';
import IntegrationProvider from '@/react/IntegrationProvider';
import { AssistantHostContext, type AssistantHostValue } from '@/react/context';
import { useHostIntegration } from '@/react/hooks/useHostIntegration';
import { useHostPageContext } from '@/react/hooks/useHostPageContext';
import { HIGHLIGHT_ATTRIBUTE } from '@/react/hooks/useUiTarget';

type HostEntities = NonNullable<HostContext['entities']>;

/** A URL router, reduced to what the assistant needs. */
export interface AssistantHostPathRouter {
  /** Current route (pathname only; keep query state out of it). */
  pathname: string;
  /** Opens a catalog path with validated parameters; see `queryNavigate`. */
  navigate: NavigateActionOptions['navigate'];
}

/** A host that switches pages by state instead of URL. */
export interface AssistantHostPageRouter<TKey extends string> {
  /** Key of the current page in the catalog. */
  page: TKey;
  /** Opens a catalog page, with validated parameters for pages that declare them. */
  navigate: (page: TKey, params?: NavigateParams) => void | Promise<void>;
}

export type AssistantHostRouter<TKey extends string = string> =
  AssistantHostPathRouter | AssistantHostPageRouter<TKey>;

/** Passed to the `actions` factory. */
export interface AssistantHostApi {
  targets: UiTargetRegistry;
  principal: HostPrincipal | null;
  navigate: NavigateActionOptions['navigate'];
}

export interface AssistantHighlightOptions {
  /** CSS color of the outline. Default `currentColor`. */
  color?: string;
}

export interface AssistantHostProps<TKey extends string> {
  /** Pages, their permissions and parameters; drives destinations and `ui.navigate`. */
  pages: PageCatalog<TKey>;
  /** `{ pathname, navigate }` for URL routers, or `{ page, navigate }` for state-based pages. */
  router: AssistantHostRouter<NoInfer<TKey>>;
  /** The signed-in user's permissions. Not authorization: handlers and backends still check. */
  principal?: HostPrincipal | null;
  /** Domain actions. `ui.navigate` is added from `pages`. */
  actions?: (api: AssistantHostApi) => HostActionInput[];
  /** Memoized value the `actions` factory depends on; actions re-register when it changes. */
  actionDeps?: unknown;
  /** Host rules before navigation; throw `createIntegrationError` to refuse. */
  beforeNavigate?: NavigateActionOptions['beforeNavigate'];
  /** Entities shared by every page (for example the current workspace). */
  entities?: HostEntities;
  /** Page metadata for routes outside the catalog. */
  fallbackPage?: HostContext['page'];
  /**
   * `embedded` connects a same-window assistant and exposes it as `useAssistantHost().embedded`.
   * `external` (default) leaves the connection to `AssistantEmbed` / `AssistantIframe`.
   */
  connection?: 'embedded' | 'external';
  /** Timeout for the embedded assistant to register its command handler. */
  embeddedTimeoutMs?: number;
  /** Adds a default outline for highlighted targets (`[data-assistant-highlight]`). */
  highlight?: boolean | AssistantHighlightOptions;
  commandTimeoutMs?: number;
  actionTimeoutMs?: number;
  onTimeline?: (entry: IntegrationTimelineEntry) => void;
  children: ReactNode;
}

const FALLBACK_PAGE: HostContext['page'] = { title: 'Page', type: 'other' };

const EMPTY_ENTITIES: HostEntities = [];

const highlightCss = ({ color = 'currentColor' }: AssistantHighlightOptions) => `
[${HIGHLIGHT_ATTRIBUTE}] {
  outline: 2px solid ${color};
  outline-offset: 3px;
  border-radius: 6px;
  animation: assistant-bridge-pulse 1.2s ease-in-out 3;
}
@keyframes assistant-bridge-pulse {
  50% { outline-offset: 6px; }
}
@media (prefers-reduced-motion: reduce) {
  [${HIGHLIGHT_ATTRIBUTE}] { animation: none; }
}`;

/**
 * One component for a typical host: creates the integration, publishes route, page,
 * destinations, principal and entities, registers `ui.navigate` from the page catalog plus
 * the host's actions, and optionally connects a same-window assistant.
 */
const AssistantHost = <TKey extends string>({
  pages,
  router,
  principal = null,
  actions,
  actionDeps,
  beforeNavigate,
  entities = EMPTY_ENTITIES,
  fallbackPage = FALLBACK_PAGE,
  connection = 'external',
  embeddedTimeoutMs,
  highlight = false,
  commandTimeoutMs,
  actionTimeoutMs,
  onTimeline,
  children,
}: AssistantHostProps<TKey>) => {
  // Router callbacks often change identity per render; actions call the latest ones.
  // A layout effect, because action registration also runs in one.
  const navigateTo = useMemo<NavigateActionOptions['navigate']>(() => {
    if (!('page' in router)) {
      return router.navigate;
    }

    const open = router.navigate;

    // Paths come from the catalog, so every allowed path maps back to a page key.
    return (path, params) => {
      const key = pages.pageKeyFromRoute(path);

      if (!key) {
        throw createIntegrationError(ERROR_CODES.ACTION_NOT_AVAILABLE);
      }

      return params === undefined ? open(key) : open(key, params);
    };
  }, [pages, router]);

  const pathname = 'page' in router ? pages.route(router.page) : router.pathname;

  const latest = useRef({ navigate: navigateTo, beforeNavigate, actions });

  useLayoutEffect(() => {
    latest.current = { navigate: navigateTo, beforeNavigate, actions };
  });

  const navigate = useCallback<NavigateActionOptions['navigate']>(
    (path, params) =>
      params === undefined ? latest.current.navigate(path) : latest.current.navigate(path, params),
    [],
  );

  const guard = useCallback<NonNullable<NavigateActionOptions['beforeNavigate']>>(
    (path, params) => latest.current.beforeNavigate?.(path, params),
    [],
  );

  const permissionsKey = JSON.stringify(principal?.permissions ?? null);

  // Re-register actions when permissions, the catalog or host dependencies change.
  const registration = useMemo(
    () => ({ pages, permissionsKey, actionDeps }),
    [pages, permissionsKey, actionDeps],
  );

  const pageKey = pages.pageKeyFromRoute(pathname);
  const page = pageKey ? pages.pageMeta(pageKey) : fallbackPage;

  const integration = useHostIntegration({
    initialRoute: pathname,
    initialPage: page,
    commandTimeoutMs,
    actionTimeoutMs,
    onTimeline,
    actionDeps: registration,
    actions: ({ targets }) => {
      const navigation = pages.navigation(principal, { navigate, beforeNavigate: guard });

      const hasPages =
        navigation.allowedRoutes?.length || Object.keys(navigation.routes ?? {}).length;

      return [
        ...(hasPages ? [navigateAction(navigation) as HostActionInput] : []),
        ...(latest.current.actions?.({ targets, principal, navigate }) ?? []),
      ];
    },
  });

  const [pageEntities, setPageEntities] = useState<ReadonlyMap<symbol, HostEntities>>(
    () => new Map(),
  );

  const publishPageEntities = useCallback((owner: symbol, next: HostEntities | null) => {
    setPageEntities((current) => {
      const updated = new Map(current);

      if (next) {
        updated.set(owner, next);
      } else {
        updated.delete(owner);
      }

      return updated;
    });
  }, []);

  const allEntities = useMemo(
    () => [...entities, ...[...pageEntities.values()].flat()],
    [entities, pageEntities],
  );

  // The context manager ignores updates with equal content, so new identities are cheap.
  const destinations = useMemo(() => pages.destinationsFor(principal), [pages, principal]);

  const pageTitle = page.title;
  const pageType = page.type;

  const publishedPage = useMemo(
    () => ({ title: pageTitle, type: pageType }),
    [pageTitle, pageType],
  );

  useHostPageContext(integration, {
    route: pathname,
    page: publishedPage,
    entities: allEntities,
    destinations,
    principal,
  });

  const [embedded, setEmbedded] = useState<EmbeddedAssistantOptions | null>(null);

  useEffect(() => {
    if (connection !== 'embedded') {
      return undefined;
    }

    const assistant = connectEmbeddedAssistant(integration, { timeoutMs: embeddedTimeoutMs });

    setEmbedded({ bridge: assistant.bridge, onReady: assistant.onReady });

    return () => {
      setEmbedded(null);
      assistant.dispose();
    };
  }, [connection, embeddedTimeoutMs, integration]);

  const ask = useCallback(
    (prompt: string, options?: AskOptions) =>
      integration.assistantCommands.askAbout(prompt, options),
    [integration],
  );

  const value = useMemo<AssistantHostValue>(
    () => ({ integration, ask, embedded, publishPageEntities }),
    [ask, embedded, integration, publishPageEntities],
  );

  return (
    <IntegrationProvider integration={integration}>
      <AssistantHostContext.Provider value={value}>
        {highlight ? <style>{highlightCss(highlight === true ? {} : highlight)}</style> : null}
        {children}
      </AssistantHostContext.Provider>
    </IntegrationProvider>
  );
};

export default AssistantHost;
