# assistant-bridge/react

> **New host?** Start with [`AssistantHost`](#assistanthost) and the [host quick start](quick-start.md). **New chat?** Start with the [chat quick start](chat-quick-start.md).

Two React entry points of the single `assistant-bridge` package. Import them only in React consumers and supply the optional `react` peer dependency. The root entry remains framework agnostic.

| Entry                         | Side | Exports                                                                                                 |
| ----------------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| `assistant-bridge/react`      | Host | `AssistantHost`, `useAssistantHost`, `useUiTarget`, `usePageEntities`, `useAssistantPanel`              |
| `assistant-bridge/chat/react` | Chat | `useAssistantIntegration`, `useAssistantContext`, `useAssistantCommandHandler`, `useActionConfirmation` |

`AssistantHost` creates, publishes and disposes the integration. Components below it reach it with `useAssistantHost()`, which returns `null` outside a host, so shared components can render with or without one.

## UI targets

```tsx
import { useUiTarget } from 'assistant-bridge/react';

const { ref, highlighted } = useUiTarget<HTMLInputElement>('catalog-search', {
  onSelect: (value) => setSearch(value ?? ''),
});
// <input ref={ref} className={highlighted ? 'my-highlight' : undefined} />
```

The hook registers the target with the current integration and unregisters it on ID change or unmount. It provides highlighting state, focus, scrolling and selection callbacks. An optional `focusRef` directs focus and scrolling to a nested element; `scrollIntoView(element, behavior)` replaces the default `scrollIntoView({ block: 'center' })`, for example to scroll only the nearest container. The host owns IDs, selection callbacks and highlight styles.

Outside `AssistantHost` the hook does nothing, so shared components can register targets whether or not a host is mounted. While highlighted, the element carries `data-assistant-highlight`; style it, or pass `highlight` to `AssistantHost`.

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

`useAssistantHost` and `useUiTarget` work below `AssistantHost`. Keep `principal` to permission names; it is not authorization. Hosts without React use `createHostIntegration`; see the [Core API](core.md).

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

Import these from `assistant-bridge/chat/react`. Use `useAssistantIntegration({ bridge, onReady, commands })` with an explicitly supplied connection. Without `bridge`, the chat stays disconnected and may continue standalone using its own backend. The hook does not inspect parent windows or URL parameters.

`useAssistantContext(client)` reads the latest snapshot, subscribes to changes and releases subscriptions on replacement/unmount. `useAssistantCommandHandler(handler, onReady)` registers a fresh handler and the protocol version, and unregisters on replacement/unmount. Neither hook loads a chat or creates a host integration.

A separately built chat uses the same hooks and props as a local component. A MessagePort bootstrap lives in application integration code; see [connections](connections.md).

## Host page context and assistant commands

`AssistantHost` publishes the route, page, selection policy and entities from its page catalog and `entities` prop. The core manager commits them atomically; equivalent values do not republish context or bump the revision. To ask the assistant from a component, use `useAssistantHost()?.ask(prompt, { selection, metadata })`.

## Action confirmation UI

```tsx
import { createAssistantActionExecutor } from 'assistant-bridge/chat';
import { useActionConfirmation } from 'assistant-bridge/chat/react';

const { confirmation, requestConfirmation, approve, reject } = useActionConfirmation();

// The executor asks through requestConfirmation and supplies its cancellation signal:
const executor = createAssistantActionExecutor(bridge, { signal, requestConfirmation });

// Render your own card with confirmation, approve and reject.
```

This hook needs nothing from the host's React tree and works in the independent chat app. Pending state and promise orchestration live in the core `createActionConfirmationController`; React subscribes using `useSyncExternalStore`. Stop/disconnect cancels via the executor-supplied signal. Unmount cancels pending work and permanently disposes the controller after the Strict Mode replay window. Stale handlers cannot approve a newer confirmation. Existing single-argument confirmation callbacks remain supported.

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
