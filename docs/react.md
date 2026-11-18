# assistant-bridge/react

> **New host?** Start with [`AssistantHost`](#assistanthost) and the [host quick start](quick-start.md). **New chat?** Start with the [chat quick start](chat-quick-start.md). The provider and hooks below are the lower-level parts those are built from.

Optional React context from the single `assistant-bridge` package. Import this entry point only in React consumers and supply the optional `react` peer dependency. The root entry remains framework agnostic.

```tsx
import {
  IntegrationProvider,
  useIntegration,
  useOptionalIntegration,
} from 'assistant-bridge/react';

// integration is the host-owned, stable result of createHostIntegration().
<IntegrationProvider integration={integration}>{children}</IntegrationProvider>;

// In a descendant component:
const { assistantCommands } = useIntegration();

// In a component that may render without a host (before sign-in, standalone):
const integration = useOptionalIntegration(); // HostIntegration | null
```

`useIntegration()` throws outside `IntegrationProvider`. `useOptionalIntegration()` returns `null` there, so a component can render with or without a host and ask the question explicitly.

The provider only shares the supplied integration; it does not create or destroy it. Use `useHostIntegration` for SDK-managed instance lifecycle, or manage a core `createHostIntegration` instance yourself. The host owns routing and action handlers. Hosts typically wrap it to publish route changes via `updatePage` with their own selection policy.

## Managed host integration

```tsx
import { IntegrationProvider, useHostIntegration } from 'assistant-bridge/react';

const integration = useHostIntegration({
  onTimeline,
  actions: ({ targets }) => createHostActions({ navigate, targets }),
});
// <IntegrationProvider integration={integration}>{children}</IntegrationProvider>
```

`useHostIntegration` owns one stable integration per mounted hook. It buffers bootstrap timeline entries until commit, forwards later entries to the latest `onTimeline` callback, and manages final teardown. This avoids notifying application stores during render. Action factories must be pure: return action definitions without performing application side effects.

New `actions` arrays/factories are applied after commit, so handlers and availability checks use current router/application callbacks. Treat action arrays as immutable. The hook replaces only actions it owns and preserves unrelated registrations. Published capabilities are refreshed only when their descriptions change; changing handler closures alone does not bump the context revision. An action name must be unique and cannot collide with an unrelated registration.

When the `actions` factory closes over changing host state, pass a memoized `actionDeps` value (for example `{ host: actionHost }`). While `actionDeps` is set, action registration follows that reference instead of the factory reference, so inline `actions: ({ targets }) => …` factories do not re-register on every render.

Initial route/page, initial destinations and request timeout options are bootstrap settings for the instance. Destinations that depend on the user or environment do not need a remount: pass the current list to `useHostPageContext` (or `integration.updatePage`) and it replaces the published list. Remount only to change the timeouts. Continue publishing current page changes with `integration.updatePage`; route metadata, allowed actions and selection policy remain host-owned.

On final unmount, the hook clears active highlights, marks the assistant unavailable, rejects pending requests and destroys the bridge. Disposal waits one microtask, allowing immediate React Strict Mode effect replay to reuse the live instance. Child target and transport components still perform their own cleanup. Do not manually destroy an integration owned by this hook. The context-only `IntegrationProvider` still accepts manually created instances for consumers that want to manage their own lifecycle.

## UI targets

```tsx
import { useUiTarget } from 'assistant-bridge/react';

const { ref, highlighted } = useUiTarget<HTMLInputElement>('catalog-search', {
  onSelect: (value) => setSearch(value ?? ''),
});
// <input ref={ref} className={highlighted ? 'my-highlight' : undefined} />
```

The hook registers the target with the current integration and unregisters it on ID change or unmount. It provides highlighting state, focus, scrolling and selection callbacks. An optional `focusRef` directs focus and scrolling to a nested element; `scrollIntoView(element, behavior)` replaces the default `scrollIntoView({ block: 'center' })`, for example to scroll only the nearest container. The host owns IDs, selection callbacks and highlight styles.

Outside `IntegrationProvider` the hook does nothing, so shared components can register targets whether or not a host is mounted. While highlighted, the element carries `data-assistant-highlight` (`HIGHLIGHT_ATTRIBUTE`); style it, or pass `highlight` to `AssistantHost`.

## AssistantHost

One component for a typical host. It creates the integration, publishes route, page, destinations, principal and entities, registers `ui.navigate` from the page catalog plus the host's own actions, and can connect a same-window assistant.

```tsx
import { queryNavigate } from 'assistant-bridge';
import { AssistantHost, useAssistantHost, usePageEntities } from 'assistant-bridge/react';

<AssistantHost
  pages={pages} // definePageCatalog with needs/params
  router={{ pathname: location.pathname, navigate: queryNavigate(routerNavigate, { environment }) }}
  principal={{ id: user.id, permissions }}
  entities={[{ type: 'environment', id: environment, label: environmentName }]}
  actions={({ targets, navigate }) => createDomainActions({ targets, navigate, state })}
  connection="embedded"
  highlight={{ color: 'var(--brand)' }}
>
  {children}
</AssistantHost>;

// In a page:
usePageEntities([{ type: 'entry', id: entry.id, label: entry.title }]);

// Anywhere below the host:
const host = useAssistantHost(); // null outside a host
await host?.ask('Summarize this entry');
```

- **Pages and navigation:** `ui.navigate` comes from `pages.navigation(principal, …)`. Destinations follow `pages.destinationsFor(principal)`. Both update when permissions change, without remounting.
- **Router:** `pathname` selects the page through `pages.pageKeyFromRoute`; routes outside the catalog publish `fallbackPage`. `navigate` receives validated `params` only for pages that declare them. The latest `navigate`, `beforeNavigate` and `actions` are always used, so inline callbacks are fine.
- **Actions:** the `actions` factory receives `targets`, `principal` and a stable `navigate`, and runs on every render. Handlers and `available` therefore always use current host state; there is nothing to memoize. Actions re-register only when what the assistant sees changes (names, descriptions, schemas, approval), for example after a permission change. Keep the factory pure: it returns definitions and must not cause side effects.
- **Entities:** `entities` are shared by every page. `usePageEntities` adds a component's entities while it is mounted, merged in mount order and compared by content.
- **Connection:** `connection="embedded"` connects a same-window assistant and exposes `bridge` and `onReady` as `useAssistantHost().embedded`. The default, `external`, leaves connection setup to the host application. Load a remote before creating its connection so remote loading and receiver readiness have separate timeouts.
- **Asking:** `ask(prompt, { selection, metadata })` is `assistantCommands.askAbout`; it rejects when no assistant is ready.
- **State-based pages:** a host that switches pages by state instead of URL passes `router={{ page, navigate }}`, with the current catalog key and a function that opens a key. `ui.navigate` still validates paths and parameters against the catalog, then calls `navigate(pageKey, params)`.
- **Highlight:** `highlight` adds an outline for `[data-assistant-highlight]`, with a reduced-motion fallback.

`AssistantHost` renders `IntegrationProvider`, so `useIntegration` and `useUiTarget` work below it. Keep `principal` to permission names; it is not authorization. For full control, compose `useHostIntegration` and `useHostPageContext` as before.

## Assistant panel behavior

```tsx
import { useAssistantPanel } from 'assistant-bridge/react';

const { open, openPanel, closePanel, status, onStatus, attempt, reconnect } = useAssistantPanel();
```

The hook starts closed with `status: 'loading'` and `attempt: 0`. Host commands open the panel, except `assistant.close`, which closes it. Local `openPanel` / `closePanel` only change visibility; they do not send commands or announce connection readiness. Command listening is removed on unmount.

Pass the stable `onStatus` callback to the chosen connection adapter. `reconnect` sets status to loading and increments `attempt`, preserving visibility. The host uses `attempt` as a connection subtree key to remount the adapter and passes it as the federation retry number. The hook itself does not load or reconnect a transport.

The host keeps the panel/launcher markup, styling, loading/error messages and URLs. Closing the panel can keep the assistant mounted so it continues receiving commands and context.

## Host-owned chat mounting

The SDK has no embedding component, remote loader or iframe initialization. The host loads and mounts the chat and passes `bridge` and `onReady` from `connectEmbeddedAssistant`, or uses `AssistantHost` with `connection="embedded"` for an already available same-window chat. Both local and remote components accept `EmbeddedAssistantOptions`. Chat code must not require the host's React context.

The host owns loading indicators, render error boundaries and load retry. SDK status describes protocol receiver readiness. See [connections and migration](connections.md).

## Assistant-side hooks

Use `useAssistantIntegration({ bridge, onReady, commands })` with an explicitly supplied connection. Without `bridge`, the chat stays disconnected and may continue standalone using its own backend. The hook does not inspect parent windows or URL parameters.

`useAssistantContext(client)` reads the latest snapshot, subscribes to changes and releases subscriptions on replacement/unmount. `useAssistantCommandHandler(handler, onReady)` registers a fresh handler and the protocol version, and unregisters on replacement/unmount. Neither hook loads a chat or creates a host integration.

A separately built chat uses the same hooks and props as a local component. A MessagePort bootstrap lives in application integration code; see [connections](connections.md).

## Host page context and assistant commands

`useHostPageContext(integration, { route, page, selection, entities })` synchronizes host-supplied page context. The integration is explicit so this hook can run in the component creating the provider. The host owns router integration, entity mapping and selection policy. `selection` defaults to `clear`; omitted `entities` clears old summaries. The hook forwards one `updatePage` call; the core manager compares values and commits route, selection, entities and derived capabilities atomically. Equivalent values do not republish context or bump the revision. Entity-only changes do not clear selection/highlights; route, page metadata or selection-policy changes apply the selection policy.

```tsx
useHostPageContext(integration, {
  route: location.pathname,
  page: { title: 'Records', type: 'records' },
  selection: 'clear',
  entities: recordSummaries,
});
```

With a page catalog, `AssistantHost` publishes the page for you. To ask the assistant from a component, use `useAssistantHost()?.ask(prompt, { selection, metadata })`.

`useHostIntegration` now delegates permanent cleanup to `integration.dispose()`. When creating an integration outside this hook, call `dispose()` from the owning application lifecycle. A shared `IntegrationProvider` does not own disposal. The method is idempotent; a disposed instance must not be reused.

## Action confirmation UI

```tsx
import { createAssistantActionExecutor } from 'assistant-bridge';
import { useActionConfirmation } from 'assistant-bridge/react';

const { confirmation, requestConfirmation, approve, reject } = useActionConfirmation();

// The executor asks through requestConfirmation and supplies its cancellation signal:
const executor = createAssistantActionExecutor(bridge, { signal, requestConfirmation });

// Render your own card with confirmation, approve and reject.
```

This hook does not need `IntegrationProvider` and works in the independent chat app. Pending state and promise orchestration live in the core `createActionConfirmationController`; React subscribes using `useSyncExternalStore`. Stop/disconnect cancels via the executor-supplied signal. Unmount cancels pending work and permanently disposes the controller after the Strict Mode replay window. Stale handlers cannot approve a newer confirmation. Existing single-argument confirmation callbacks remain supported.

### Form controls, sections and tabs

Enable actions explicitly with `createUiActions({ targets: { registry: targets,
enable: ['setValue', 'setChecked', 'setExpanded', 'activateTab', 'clearHighlight'] } })`.
Each target advertises only the callbacks it implements. `clearHighlight` is available
on every registered target and cancels its pending highlight timeout.

```tsx
const search = useUiTarget<HTMLInputElement>('renewals-search', {
  onSetValue: setSearch,
});
const checkbox = useUiTarget<HTMLInputElement>('include-expired', {
  onSetChecked: setIncludeExpired,
});
const section = useUiTarget<HTMLDivElement>('renewal-details', {
  onSetExpanded: setDetailsExpanded,
});
const activateHistory = useCallback(() => setActiveTab('history'), []);
const historyTab = useUiTarget<HTMLButtonElement>('history-tab', {
  onActivateTab: activateHistory,
});
```

Attach each returned `ref` to its corresponding element. These callbacks update
host state; the SDK does not assign DOM values or dispatch synthetic clicks.
`setValue` accepts a string (including an empty string); `setChecked` and
`setExpanded` require explicit booleans. Register one target per tab.

| Action              | Payload example                                   |
| ------------------- | ------------------------------------------------- |
| `ui.setValue`       | `{ targetId: 'renewals-search', value: 'Alice' }` |
| `ui.setChecked`     | `{ targetId: 'include-expired', checked: false }` |
| `ui.setExpanded`    | `{ targetId: 'renewal-details', expanded: true }` |
| `ui.activateTab`    | `{ targetId: 'history-tab' }`                     |
| `ui.clearHighlight` | `{ targetId: 'renewal-details' }`                 |

Unsupported callbacks return `ACTION_NOT_AVAILABLE`; unregistered targets return
`TARGET_NOT_FOUND`. Business validation stays in the host callbacks.

`useUiTarget` also accepts an async `onSelect` callback returning `Promise<void>`.
The `ui.select` action waits for it before reporting success and propagates
rejections. Return the promise from the callback; avoid fire-and-forget wrappers
when the assistant must wait for selection or navigation.
