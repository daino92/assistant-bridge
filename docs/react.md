# assistant-bridge/react

Optional React context from the single `assistant-bridge` package. Import this entry point only in React consumers and supply the optional `react` peer dependency. The root entry remains framework agnostic.

```tsx
import { IntegrationProvider, useIntegration } from 'assistant-bridge/react';

// integration is the host-owned, stable result of createHostIntegration().
<IntegrationProvider integration={integration}>{children}</IntegrationProvider>;

// In a descendant component:
const { assistantCommands } = useIntegration();
```

The provider only shares the supplied integration; it does not create or destroy it. Use `useHostIntegration` for SDK-managed instance lifecycle, or manage a core `createHostIntegration` instance yourself. The host owns routing and action handlers. Hosts typically wrap it to publish route changes via `updatePage` with their own selection policy.

## Managed host integration

```tsx
import { IntegrationProvider, useHostIntegration } from 'assistant-bridge/react';

const integration = useHostIntegration({
  onTimeline,
  actions: ({ targets }) => createHostActions({ navigate, openDetails, targets }),
});
// <IntegrationProvider integration={integration}>{children}</IntegrationProvider>
```

`useHostIntegration` owns one stable integration per mounted hook. It buffers bootstrap timeline entries until commit, forwards later entries to the latest `onTimeline` callback, and manages final teardown. This avoids notifying application stores during render. Action factories must be pure: return action definitions without performing application side effects.

New `actions` arrays/factories are applied after commit, so handlers and availability checks use current router/application callbacks. Treat action arrays as immutable. The hook replaces only actions it owns and preserves unrelated registrations. Published capabilities are refreshed only when their descriptions change; changing handler closures alone does not bump the context revision. An action name must be unique and cannot collide with an unrelated registration.

When the `actions` factory closes over changing host state, pass a memoized `actionDeps` value (for example `{ host: actionHost }`). While `actionDeps` is set, action registration follows that reference instead of the factory reference, so inline `actions: ({ targets }) => …` factories do not re-register on every render.

Initial route/page and request timeout options are bootstrap settings for the instance. To change those settings, remount the component that owns the hook. Continue publishing current page changes with `integration.updatePage`; route metadata, allowed actions and selection policy remain host-owned.

On final unmount, the hook clears active highlights, marks the assistant unavailable, rejects pending requests and destroys the bridge. Disposal waits one microtask, allowing immediate React Strict Mode effect replay to reuse the live instance. Child target and transport components still perform their own cleanup. Do not manually destroy an integration owned by this hook. The context-only `IntegrationProvider` still accepts manually created instances for consumers that want to manage their own lifecycle.

## UI targets

```tsx
import { useUiTarget } from 'assistant-bridge/react';

const { ref, highlighted } = useUiTarget<HTMLInputElement>('catalog-search', {
  onSelect: (value) => setSearch(value ?? ''),
});
// <input ref={ref} className={highlighted ? 'my-highlight' : undefined} />
```

The hook registers the target with the current integration and unregisters it on ID change or unmount. It provides highlighting state, focus, scrolling and selection callbacks. An optional `focusRef` directs focus and scrolling to a nested element. The host owns IDs, selection callbacks and highlight styles.

## Assistant panel behavior

```tsx
import { useAssistantPanel } from 'assistant-bridge/react';

const { open, openPanel, closePanel, status, onStatus, attempt, reconnect } = useAssistantPanel();
```

The hook starts closed with `status: 'loading'` and `attempt: 0`. Host commands open the panel, except `assistant.close`, which closes it. Local `openPanel` / `closePanel` only change visibility; they do not send commands or announce connection readiness. Command listening is removed on unmount.

Pass the stable `onStatus` callback to the chosen connection adapter. `reconnect` sets status to loading and increments `attempt`, preserving visibility. The host uses `attempt` as a connection subtree key to remount the adapter and passes it as the federation retry number. The hook itself does not load or reconnect a transport.

The host keeps the panel/launcher markup, styling, loading/error messages and URLs. Closing the panel can keep the assistant mounted so it continues receiving commands and context.

## Unified assistant embedding

```tsx
import { AssistantEmbed, useAssistantPanel } from 'assistant-bridge/react';

const { onStatus, attempt } = useAssistantPanel();

<AssistantEmbed
  config={{ mode: 'iframe', iframe: { url: assistantUrl, title: 'Assistant' } }}
  onStatus={onStatus}
  attempt={attempt}
/>;

// Or use the same component with federation configuration:
<AssistantEmbed
  config={{
    mode: 'federation',
    federation: {
      runtimeName: 'my-host',
      remoteName: 'my-chat',
      exposedModule: 'EmbeddedAssistant',
      entry: remoteEntryUrl,
    },
  }}
  onStatus={onStatus}
  attempt={attempt}
/>;
```

`AssistantEmbedConfig` is a discriminated union: each mode requires its own configuration. `AssistantEmbedProps` and `AssistantEmbedConfig` are exported from `/react`. Render beneath `IntegrationProvider`. The component adds no wrapper or visual styles; standard iframe props belong inside `iframe`.

`attempt` defaults to zero. Increasing it remounts the selected adapter, so the host does not need a connection subtree key. Switching mode disposes the previous adapter. Ordinary status callback changes do not reconnect. Keep configuration values stable unless the connection should change.

The federation adapter is dynamically imported only when federation is selected. Its module load reports `loading`, then hands status reporting to the existing adapter. Import failure or module-load timeout reports `error`; retry increments `attempt` and tries loading again. `timeoutMs` in the federation configuration bounds module loading (default 10 seconds) and separately bounds the adapter's remote/receiver connection phase. Late imports after timeout or unmount are ignored. No error UI is supplied.

Iframe mode does not execute or download the federation adapter. Bundlers still resolve the dynamic import when building this unified entry, so consumers building it need the federation peer available; use a build that excludes that branch if the peer must be absent entirely. Federation still requires the host's build plugin/shared dependency configuration. The individual components remain available for explicit adapter selection.

## Ready-made iframe component

```tsx
import { AssistantIframe, useAssistantPanel } from 'assistant-bridge/react';

const { onStatus, attempt } = useAssistantPanel();
// Within your panel's content container:
<AssistantIframe
  key={attempt}
  url={assistantUrl}
  title="Assistant"
  onStatus={onStatus}
  className="assistant-frame"
/>;
```

Render inside `IntegrationProvider`. The SDK adds the embedding/host-origin query parameters and owns connection setup and cleanup. `url` and an accessible `title` are required. Standard iframe props such as `className`, `style`, `allow` and `sandbox` are forwarded; `src` and `srcDoc` are controlled by the SDK. The component adds no visual styles: the host sets frame size, border and background. `timeoutMs` defaults to 8 seconds and `assistantId` defaults to `assistant-iframe`. Change the key to reconnect the frame. Status callback changes do not reconnect it.

## Ready-made federated React component

```tsx
import { FederatedAssistant } from 'assistant-bridge/react/federation';

<FederatedAssistant
  runtimeName="my-host"
  remoteName="my-chat"
  exposedModule="EmbeddedAssistant"
  entry={remoteEntryUrl}
  attempt={attempt}
  onStatus={onStatus}
/>;
```

This separate subpath requires both React and the federation runtime. Importing `/react` alone does not import federation. Configure shared dependencies in the host build and supply the runtime/remote names and entry URL.

The component loads the remote, supplies only `EmbeddedAssistantOptions`, and owns command readiness registration, cleanup and a React error boundary. Render failures report `error` through `onStatus` and render no remote UI; the host displays its own failure message and reconnect control. A changed remote configuration or attempt remounts the rendering session and resets its error boundary. Late results from disposed connections are ignored. Callback changes do not reload the remote.

`attempt` defaults to zero; increase it for retries. `timeoutMs` defaults to 10 seconds and includes loading/receiver readiness. `assistantId` defaults to `assistant-federation`. Unlike the generic `/federation` loader, this component specifically expects a default React component accepting `EmbeddedAssistantOptions`.

The host `AssistantPanel` in `src/components/AssistantPanel.tsx` uses `AssistantEmbed` to select these adapters. It owns public URLs, mode selection, shared runtime configuration and panel/launcher visuals. The panel stays mounted while closed and offers reconnect on connection errors.

## Existing chat integration

`useAssistantIntegration` composes host connection, current context, fresh command callbacks, action execution and approval state. It supports directly supplied `bridge`/`onReady`, iframe initialization and standalone operation without a host provider. It does not own chat UI, messages or backend transport. Use it to adapt an existing chat; the lower-level hooks below remain available.

```tsx
const integration = useAssistantIntegration({
  bridge,
  onReady,
  commands: {
    onOpen: openChat,
    onClose: closeChat,
    onFocus: focusInput,
    onPrefill: setDraft,
    onSubmit: sendThroughExistingBackend,
  },
});
```

Use `integration.context` and `integration.isConnected` for host state. Await `integration.executeHostAction(name, payload)` for backend-originated host requests. Render `integration.confirmation` with `approve`/`reject`, or supply `actions.requestConfirmation` for an existing approval UI. AG-UI consumers can pass `integration.bridge` and `integration.requestConfirmation` to their existing session. See the [existing chat integration guide](existing-chat.md) for lifecycle, backend protocol boundaries, and Commercebot/Tell-a-story adapter mappings.

## Assistant-side hooks

These hooks run inside the chat, including a standalone chat without `IntegrationProvider`. They use only `AssistantBridgeClient` and the embedding callbacks; host registries and services are not exposed.

```tsx
import {
  useAssistantIframeConnection,
  useAssistantContext,
  useAssistantCommandHandler,
} from 'assistant-bridge/react';

// bridge and onReady are optional embedding props; onCommand belongs to the chat.
const [iframeClient, setIframeClient] = useState<AssistantBridgeClient>();
const client = bridge ?? iframeClient;
const context = useAssistantContext(client);

useAssistantIframeConnection({
  enabled: !bridge,
  onClient: setIframeClient,
  onCommand,
});
useAssistantCommandHandler(onCommand, onReady);
```

`useAssistantIframeConnection` initializes the assistant end of the iframe connection. Supply `hostOrigin` explicitly or let it read the SDK's `hostOrigin` query parameter on initialization. With no origin, or outside an iframe, no connection is established. Disable the hook when a same-window client is supplied. Cleanup removes the handshake listener and disposes the port; an established connection clears the client through `onClient(undefined)`. Changes to command/client callbacks use their latest implementations without reconnecting. The hook has no UI and does not create a host integration.

`useAssistantContext(client)` reads the client's context snapshot, subscribes to changes, unsubscribes when the client changes or the component unmounts, and clears context when the client becomes undefined. It works identically for iframe and directly supplied clients.

`useAssistantCommandHandler(onCommand, onReady)` registers the chat's latest command implementation through the supplied readiness callback. It skips registration without `onReady`, and invokes the registration's cleanup when it changes or the chat unmounts. The chat remains responsible for executing commands and producing their results. No extra refs or effect wiring are required in the chat.

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

When the host uses `definePageCatalog`, `useHostPageContextFromCatalog(integration, { catalog, pageKey, selection, entities })` is equivalent to passing `route: catalog.route(pageKey)` and `page: catalog.pageMeta(pageKey)` to `useHostPageContext`, so providers do not repeat those two lines on every page change.

```tsx
useHostPageContextFromCatalog(integration, {
  catalog,
  pageKey: currentPage,
  selection: 'clear',
  entities,
});
```

Inside `IntegrationProvider`, `useAskAi()` exposes stable `askAbout(prompt, selection?)` and `prefillOnly(text)` callbacks. The host may re-export the hook from its own barrel; it no longer needs a local implementation.

`useHostIntegration` now delegates permanent cleanup to `integration.dispose()`. When creating an integration outside this hook, call `dispose()` from the owning application lifecycle. A shared `IntegrationProvider` does not own disposal. The method is idempotent; a disposed instance must not be reused.

## Action confirmation UI

```tsx
import { useActionConfirmation } from 'assistant-bridge/react';
import { createHostAgentOptions } from 'assistant-bridge/ag-ui';

const { confirmation, requestConfirmation, approve, reject } = useActionConfirmation();

// During run setup; the executor supplies its combined cancellation signal:
const hostOptions = createHostAgentOptions(bridge, {
  signal: runController.signal,
  requestConfirmation,
});

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
