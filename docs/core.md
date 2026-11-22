# Core API

The framework-independent API of `assistant-bridge`. It has no React or federation imports.

> **React host?** You need only `definePageCatalog`, `defineAction` and `createIntegrationError` from this page, together with `AssistantHost`; see the [host quick start](quick-start.md). The rest of this page is for hosts without React and for cases `AssistantHost` does not cover.

<pre>
├─ Overview
│  └─ <a href="#building-blocks">createHostIntegration, UiTargetRegistry, AssistantBridgeClient</a>
├─ Host setup
│  ├─ <a href="#create-the-host-integration">createHostIntegration</a>
│  ├─ <a href="#define-host-actions">defineAction</a>
│  └─ <a href="#compose-common-ui-actions">createUiActions</a>
├─ Host context
│  ├─ <a href="#update-the-page">integration.updatePage</a>
│  ├─ <a href="#publish-context">integration.setSelection</a>
│  ├─ <a href="#context-commits">Context commits and revisions</a>
│  ├─ <a href="#define-page-catalog">definePageCatalog</a>
│  ├─ <a href="#publish-the-signed-in-principal">principal, whenPermitted</a>
│  ├─ <a href="#map-host-entities">mapHostEntities</a>
│  └─ <a href="#describe-entity-structure">Describing entity structure</a>
├─ Assistant client and commands
│  ├─ <a href="#use-the-client-inside-the-assistant">AssistantBridgeClient</a>
│  ├─ <a href="#send-commands-from-the-host">assistantCommands, connectEmbeddedAssistant</a>
│  ├─ <a href="#send-commands-from-the-host">askAbout, prefillAndOpen</a>
│  └─ <a href="#dispatch-assistant-commands">createAssistantCommandDispatcher</a> (/chat)
├─ Connections
│  ├─ <a href="connections.md#messageport-connections">connectHostPort, connectAssistantPort</a> (/transports/message-port)
│  └─ <a href="#connect-a-same-window-assistant">connectEmbeddedAssistant</a>
├─ Action execution
│  ├─ <a href="#execute-actions-from-the-assistant">createAssistantActionExecutor</a> (/chat)
│  ├─ <a href="#action-readiness">Action readiness</a>
│  ├─ <a href="#action-confirmations">createActionConfirmationController</a> (/chat)
│  ├─ <a href="#action-lifecycle">subscribeActionLifecycle</a>
│  └─ <a href="#action-schemas">Zod to JSON Schema capabilities</a>
└─ Errors and lifecycle
   ├─ <a href="#integration-errors">createIntegrationError, normalizeIntegrationError</a>
   ├─ <a href="#public-rejection-reasons">Public rejection reasons</a>
   ├─ <a href="#diagnostics-timeouts-and-failures">onTimeline, IntegrationDiagnostic</a>
   └─ <a href="#dispose-the-integration">integration.dispose</a>
</pre>

## Building blocks

| API                     | Responsibility                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `createHostIntegration` | Creates the integration: action validation and execution, published context, UI targets and the client APIs |
| `AssistantBridgeClient` | Assistant-facing access to host context and action requests                                                 |
| `HostAssistantCommands` | Host-facing commands: open, close, focus, prefill, and submit prompt                                        |
| `UiTargetRegistry`      | Resolves host-owned targets for highlighting, scrolling, focusing, and selecting                            |

The bridge, registries, event bus and port transport are internal. Use them through the returned `HostIntegration`; they are not exported.

The SDK does not provide a chat interface, model provider, backend, conversation storage, or host-specific business logic. Both real and simulated assistants can use the same client interface.

`connectEmbeddedAssistant` connects a same-window command receiver to the integration. `AssistantCommandHandler` and `EmbeddedAssistantOptions` define the framework-independent embedding contract.

## Create the host integration

Create one integration for the lifetime of the host application. Register only the actions that application intends to expose.

```ts
import { createHostIntegration, createUiActions } from 'assistant-bridge';

const integration = createHostIntegration({
  initialRoute: '/',
  initialPage: { title: 'Dashboard', type: 'dashboard' },
  actions: createUiActions({
    navigation: {
      navigate: (path) => window.history.pushState(null, '', path),
      allowedRoutes: ['/', '/catalog', '/records'],
    },
  }),
  onTimeline: (entry) => console.debug(entry),
});
```

The navigation callback is illustrative. In a routed application, supply its router's navigation function so route rendering and context updates stay coordinated. The callback may return a promise: the action result waits for it, and a rejection fails the action, so hosts can apply route preconditions or wait for page data.

After the built-in allowlist (and optional detail pattern) accepts a path, the `ui.navigate` action runs an optional **`beforeNavigate(path)`** hook, then `navigate`. Use it for host business rules without wrapping `navigate`; throw `createIntegrationError(ACTION_NOT_AVAILABLE, reason)` for stable assistant-facing guidance (see _Business reasons on ACTION_NOT_AVAILABLE_).

### Routes with parameters

Pages that keep state in the query string declare `routes`, each with a parameter schema. The assistant then sends `{ path, params }`; the SDK validates `params` against that route's schema before calling `navigate(path, params)`, and the host builds the final URL.

```ts
createUiActions({
  navigation: {
    allowedRoutes: ['/settings'],
    routes: {
      '/content': {
        description: 'Entries of one model, optionally with one entry open',
        params: z.object({ model: z.uuid(), entry: z.uuid().optional() }).strict(),
      },
    },
    navigate: (path, params) => router.navigate({ pathname: path, search: toSearch(params) }),
  },
});
```

- Paths in `allowedRoutes` and `detailPattern` take no parameters; a payload that adds `params` to them fails with `INVALID_PAYLOAD`.
- A route path in `routes` requires `params`. Missing or invalid parameters fail with `INVALID_PAYLOAD`, and `navigate` is not called.
- The published capability lists each route path with its parameter JSON Schema, so the assistant knows what to send. Without `routes`, the payload schema stays `{ path }`.
- Use `.strict()` schemas so unknown keys are rejected rather than ignored. Never copy unvalidated values into the URL.
- `beforeNavigate(path, params)` receives the validated parameters.
- `defaultActionReadiness` compares only the route. If the host publishes the pathname as `route`, a parameter change keeps the same route; supply a `ui.navigate` readiness predicate that checks the published entities or targets when later steps depend on the new page data.

Keep a custom action when opening a page needs more than navigation, for example business checks on the parameters.

The returned integration exposes `updatePage`, `setSelection`, `targetRegistry`, `assistantCommands`, `assistantClient`, `subscribeActionLifecycle` and `dispose`. The bridge, context store and action registry are internal. Give the assistant only `assistantClient`.

## Define host actions

Use `defineAction` for application-specific behavior. Its Zod schema validates incoming payloads before the handler runs; `available` can restrict execution to an appropriate host context.

```ts
import { z } from 'zod';
import { defineAction } from 'assistant-bridge';

const recordsFilterSchema = z
  .object({
    search: z.string().max(100).optional(),
    status: z.enum(['active', 'pending', 'archived', 'all']).optional(),
  })
  .strict();

// Include this action in createHostIntegration({ actions: [...] }).
// applyFilters is supplied by the host and updates its own state.
const createRecordsFilterAction = (
  applyFilters: (filters: {
    search?: string;
    status?: 'active' | 'pending' | 'archived' | 'all';
  }) => void,
) =>
  defineAction({
    name: 'records.filter',
    description: 'Filter the host records table',
    schema: recordsFilterSchema,
    available: (context) => context.route.startsWith('/records'),
    handler: (payload) => {
      applyFilters(payload);
      return { applied: payload };
    },
  });
```

An action name or exported schema does not register a handler automatically. The host must supply the action explicitly.

Built-in actions are `ui.navigate` and the UI-target actions listed in `UI_TARGET_ACTIONS`; `createUiActions` creates them. UI-target actions operate on targets registered by the host. The action factory callback provides the shared registry:

```ts
import { createHostIntegration, createUiActions } from 'assistant-bridge';

const integration = createHostIntegration({
  actions: ({ targets }) =>
    createUiActions({ targets: { registry: targets, enable: ['highlight', 'focus'] } }),
});
```

Register and unregister UI targets as their elements mount and unmount. For React, use `useUiTarget` from `assistant-bridge/react`; the core SDK does not depend on React.

## Compose common UI actions

```ts
import { UI_TARGET_ACTIONS, createUiActions, defineAction } from 'assistant-bridge';

const actions = [
  ...createUiActions({
    navigation: { navigate, allowedRoutes: ALLOWED_ROUTES, detailPattern: DETAIL_ROUTE },
    targets: { registry: targets, enable: UI_TARGET_ACTIONS },
  }),
  // Add host-specific actions with defineAction(...).
];
```

`createUiActions` returns `HostActionInput[]` without registering or executing anything. Pass the result to `createHostIntegration`, or return it from the `actions` factory of `AssistantHost`. Omitted groups enable no actions; `{}` returns an empty list. Target action names are explicitly selected and duplicate selections are included once, in their first-occurrence order. **`UI_TARGET_ACTIONS`** lists every built-in UI-target tool so hosts can enable the full set without repeating names; slice or replace it for a tighter surface. Navigation is emitted first, then selected target actions. Pass **`beforeNavigate`** inside `navigation` to guard navigation.

`CreateUiActionsOptions` and `UiTargetActionName` are exported for typed configuration. The helper delegates to the individual action factories, preserving their schemas, route checks and errors. Those factories remain available separately. Hosts still own allowed routes, target IDs and business handlers; the helper adds no catalog/records store access or implicit permissions.

## Update the page

Update the current page through one coordinated call:

```ts
integration.updatePage({
  route: pathname,
  page: { title: 'Catalog', type: 'catalog-list' },
  selection: 'clear',
});
```

This updates context, clears active highlights and refreshes capabilities. Selection defaults to `clear`; pass `preserve` for pages where the existing selection remains relevant. The host supplies that policy and its page metadata. Lower-level context APIs remain available for other updates.

## Publish context

```ts
integration.updatePage({ route: '/catalog', page: { title: 'Catalog', type: 'catalog-list' } });

// Publishes the selection and emits host.entity.selected; it does not submit a prompt.
integration.setSelection({ type: 'catalog', id: 'product-001' });

integration.setSelection(null);
```

Context includes `route`, `page`, optional `selection`, registered `capabilities`, and an incrementing `revision`. Publish route and selection changes from the host; the SDK does not observe the router or DOM itself.

`createHostIntegration` registers its actions once. To change actions while the host runs (for example after a permission change), use `AssistantHost` in React; it re-registers and republishes capabilities. Context-specific `available` checks still run during execution.

## Context commits

`integration.updatePage({ route, page, selection, entities, destinations })` applies a page change, optional selection clearing, entity summaries, navigation destinations and derived action availability in one context commit. Context subscribers see at most one revision for that update, with capabilities computed against the new page/entities. Target registrations and later data changes remain separate updates.

The core `HostContextManager` owns value equality and revision generation for all consumers. Repeating equivalent setter/update values does not notify subscribers or increment `revision`; object property order and omitted/undefined optional fields are equivalent for JSON context data. Revisions count effective published changes, not method calls.

Inputs, snapshots and each subscriber notification are deeply cloned, including page, selection, destinations, targets, entities and nested capability schemas. Mutating a returned snapshot or an input after assignment cannot alter stored state or another subscriber's notification. Reentrant updates are queued so subscribers observe revisions in order.

Repeated identical `updatePage` calls preserve current selection/highlights. Selection policy applies when route, page metadata or policy changes. Use `setSelection(null)` for an explicit same-page selection reset. Core `updatePage` preserves entities and destinations when omitted; pass `destinations: []` to remove all destinations. Destinations describe where the assistant may navigate, so update them when permissions change, and keep the `ui.navigate` allowlist in sync (`AssistantHost` derives both from the page catalog). `AssistantHost` clears old page summaries when `entities` is omitted. Hosts still own routing policy, entity mapping and action availability rules.

## Define page catalog

`definePageCatalog(definition)` turns a host-owned page map into integration metadata from one source of truth. Keys become route paths (`/dashboard`), destination labels and `HostContext.page` metadata.

```ts
import { definePageCatalog } from 'assistant-bridge';

const catalog = definePageCatalog({
  dashboard: { title: 'Dashboard', type: 'dashboard' },
  catalog: { title: 'Catalog', type: 'catalog-list' },
});

createHostIntegration({
  destinations: catalog.destinations,
  actions: [
    ...createUiActions({ navigation: { navigate, allowedRoutes: catalog.paths } }),
    // ...
  ],
});

integration.updatePage({
  route: catalog.route('catalog'),
  page: catalog.pageMeta('catalog'),
});
```

Use `catalog.pageKeyFromRoute(pathname)`, `catalog.isRoute(context, 'dashboard')`, and `catalog.isPageType(context, 'dashboard')` in navigation guards and action `available` predicates. The helper does not register routes, watch a router or choose entity payloads.

### Paths, permissions and parameters

Entries can also carry their route, the permission they need and their query parameters. The catalog then derives everything navigation needs for one principal:

```ts
const pages = definePageCatalog({
  dashboard: { title: 'Dashboard', type: 'dashboard' },
  content: {
    title: 'Content',
    type: 'content',
    needs: 'content:read',
    params: z.object({ model: z.uuid().optional() }).strict().optional(),
    paramsDescription: 'Pass params.model to list one model.',
  },
  models: { title: 'Content Models', type: 'models', needs: 'schema:read', match: 'prefix' },
});

pages.allowed(principal); // ['dashboard', 'content', ...]
pages.destinationsFor(principal); // for updatePage({ destinations })
createUiActions({ navigation: pages.navigation(principal, { navigate }) }); // allowedRoutes + routes
```

- `path` overrides the default `/<key>`. `match: 'prefix'` also maps sub-routes (`/models/<id>`) to the page; exact paths win over prefixes.
- `needs` hides a page from principals without that permission. Pages without `needs` are always allowed. It is not authorization.
- `params` makes the page a `ui.navigate` route with that schema. Use `.optional()` when the page also opens without parameters.
- `destinations` and `paths` still list every page, for hosts without permissions.

`AssistantHost` in `/react` uses these methods; see [AssistantHost](react.md#assistanthost).

### Router and target helpers

`queryNavigate(navigate, baseQuery)` adapts a router's `navigate(url)` to `navigate(path, params)`. It appends validated parameters as a query string; `baseQuery` (for example the current environment) always wins, so the assistant cannot change it.

```ts
const go = queryNavigate(routerNavigate, { environment: environmentId });
go('/content', { model }); // routerNavigate('/content?environment=…&model=…')
```

`pointOutTargets(registry, groups, { durationMs, scroll })` highlights the first registered target of each group (for example the control for an action, then its menu entry), scrolling only the first one found into view. It returns the IDs it showed.

## Action authoring helpers (optional)

For `defineAction` handlers that take no parameters, use `emptyPayloadSchema` instead of repeating `z.object({})`.

`whenPageType(catalog, pageKey)` returns an `available` predicate that delegates to `catalog.isPageType(context, pageKey)`. For actions that also depend on live application state not mirrored in `HostContext` (workspace selection, feature flags, and so on), use `whenPageTypeAnd(catalog, pageKey, host, (h) => …)`.

```ts
import {
  defineAction,
  emptyPayloadSchema,
  definePageCatalog,
  whenPageType,
  whenPageTypeAnd,
} from 'assistant-bridge';

const catalog = definePageCatalog({
  dashboard: { title: 'Dashboard', type: 'dashboard' },
});

defineAction({
  name: 'orders.open',
  description: 'Open orders from the dashboard.',
  schema: emptyPayloadSchema,
  available: whenPageType(catalog, 'dashboard'),
  handler: () => ({ opened: true }),
});

const host = { cart: { items: [] as string[] } };

defineAction({
  name: 'cart.checkout',
  description: 'Checkout when the cart is non-empty.',
  schema: emptyPayloadSchema,
  available: whenPageTypeAnd(catalog, 'dashboard', host, (h) => h.cart.items.length > 0),
  handler: () => ({ ok: true }),
});
```

## Publish the signed-in principal

`HostContext.principal` describes what the signed-in user may do, so the assistant can plan and the host can hide actions:

```ts
import { whenPermitted } from 'assistant-bridge';

integration.updatePage({
  route,
  page,
  principal: { id: user.id, permissions: ['content:read', 'content:publish'] },
});

defineAction({
  name: 'content.publish',
  description: 'Publish the open entry',
  schema: z.object({ entryId: z.uuid() }),
  available: whenPermitted('content:publish'),
  handler: ({ entryId }) => api.publish(entryId), // the backend still checks the permission
});
```

- `principal` is optional. `updatePage` (and `AssistantHost`) preserve it when omitted; pass `null` to remove it, for example on sign-out.
- Changing permissions recomputes action availability in the same context revision.
- **It is not authorization.** The principal is published to the assistant as data. Every handler and backend must still enforce permissions; `whenPermitted` only hides unavailable actions.
- Publish operation names, not roles or personal data. `label` is optional; omit it when the assistant does not need a display name. Limits: 500 permissions of up to 100 characters each.

## Map host entities

`mapHostEntities(items, mapping)` builds the standard entity summaries without depending on React, routing or a business model:

```ts
const entities = mapHostEntities(records, {
  type: 'record',
  id: (record) => record.id,
  label: (record) => record.name,
  reference: (record) => record.reference,
  aliases: (record) => [record.name],
  attributes: (record) => ({ status: record.status, version: String(record.version) }),
});

integration.updatePage({ route, page, entities });
```

`HostEntityMapping<T>` requires a type and ID/label selectors. Reference, aliases and string-valued attributes are optional; undefined optional values are omitted. The helper accepts readonly source lists and clones returned aliases/attribute maps. It does not spread source records, infer fields, filter by route, convert attribute types, deduplicate entities or publish them automatically. The host decides what data is appropriate to expose. Keep record/product selectors in host code; the host only chooses the relevant dataset and passes the resulting summaries to the SDK.

## Describe entity structure

Entities are summaries: labels, aliases and string attributes. An assistant that writes structured content (forms, nested components, ordered sections, references) also needs the shape of the thing on the page. The SDK has no schema field for entities; use one of these conventions.

- **Small, flat shapes:** add a JSON Schema string as an attribute, for example `attributes: { schema: JSON.stringify(jsonSchema) }`. Keep it short, because it travels with every context update.
- **Large or nested shapes:** describe them on demand. Register a read-only host action (for example `entity.describe` with `{ id }`) or expose a backend tool that returns the schema for an entity ID. The assistant calls it only when it needs the structure.

Prefer the on-demand pattern when shapes include components, dynamic zones or references, and keep schemas generated from the same metadata the host uses to render the form. A schema describes structure; validation and authorization still happen when the host action or backend applies the write.

## Use the client inside the assistant

```ts
import type { AssistantBridgeClient } from 'assistant-bridge/chat';
import type { HostContext } from 'assistant-bridge/contracts';

const connectAssistant = (
  client: AssistantBridgeClient,
  renderContext: (context: HostContext) => void,
) => {
  renderContext(client.getContext());
  const unsubscribe = client.subscribeContext(renderContext);

  const openCatalog = async () => {
    const context = client.getContext();
    return client.requestHostAction('ui.navigate', { path: '/catalog' }, context.revision);
  };

  return { openCatalog, dispose: unsubscribe };
};
```

`getContext()` returns the latest available snapshot. `subscribeContext()` receives subsequent changes and returns an unsubscribe function. An action request resolves to the handler's returned data or rejects on failure.

The optional revision is a **minimum host revision**, not an exact-match check. The registry rejects a request when the host revision is lower than the supplied revision; a newer host context is accepted.

## Send commands from the host

Once a receiver is attached and ready:

```ts
await integration.assistantCommands.open();
await integration.assistantCommands.focus();
await integration.assistantCommands.prefill('Review the selected item');
await integration.assistantCommands.submitPrompt('Show active records', {
  source: 'records-page',
});
await integration.assistantCommands.close();
```

The receiver must implement these commands. Each one resolves with a typed result from the contract, which the host checks:

| Command                  | Result                |
| ------------------------ | --------------------- |
| `assistant.open`         | `{ opened: true }`    |
| `assistant.close`        | `{ closed: true }`    |
| `assistant.focus`        | `{ focused: true }`   |
| `assistant.prefill`      | `{ prefilled: true }` |
| `assistant.submitPrompt` | `{ accepted: true }`  |

An assistant that cannot carry out a command rejects it; there is no `false` result. An answer in another shape rejects on the host with `INVALID_PAYLOAD`. The schemas are `assistantCommandResultDataSchemas` in `assistant-bridge/contracts`, typed as `AssistantCommandResultData`. The SDK does not create or open a panel itself. `submitPrompt()` resolves when the assistant accepted the prompt, not when the answer is complete.

For a same-window receiver, use `connectEmbeddedAssistant(integration)` and pass its `onReady` to the assistant, which registers its command handler there. The SDK validates command envelopes and emits correlated results from the handler's return value or rejection. The handler must validate command-specific payloads and reject unsupported commands.

For a MessagePort receiver, `connectAssistantPort` forwards requests to its supplied `onCommand` callback and creates result envelopes from its return value or rejection.

Host command helpers combine these commands:

```ts
await integration.assistantCommands.askAbout('Explain this item', { type: 'catalog', id });
await integration.assistantCommands.prefillAndOpen('Review current selection');
```

`askAbout` publishes an optional selection, opens the assistant, then submits the prompt with the current context revision. Pass extra data for the assistant as `metadata`:

```ts
await integration.assistantCommands.askAbout('Why this offer?', {
  selection: { type: 'offer', id },
  metadata: { questionContext: offerSummary },
});
```

The metadata reaches the receiver's `submitPrompt` handler next to `contextRevision` and `selection`, which the host sets and metadata cannot override. The second argument may still be a selection alone. `prefillAndOpen` opens before prefilling. Use `askAbout(prompt)` for suggested-question links instead of chaining `open()` and `submitPrompt()` yourself; it also works outside React.

Suggested questions are host data. Filter them in host code by page and by what the signed-in user may do, then pass the chosen prompt to `askAbout`. The assistant does not need to know which suggestions were hidden. Both commands reject when no receiver is ready (for example when the assistant is disabled), so handle the rejection where the user clicked.

## Dispatch assistant commands

`createAssistantCommandDispatcher` validates the standard command envelope and prefill/submit payloads, then invokes supplied callbacks:

```ts
import { createAssistantCommandDispatcher } from 'assistant-bridge/chat';

const onCommand = createAssistantCommandDispatcher({
  onOpen: () => ({ opened: true }),
  onClose: closeConversation,
  onFocus: focusInput,
  onPrefill: (text) => {
    setInput(text);
    focusInput();
  },
  onSubmit: (prompt, metadata) => submitPrompt(prompt, metadata),
});
```

Callbacks may be synchronous or asynchronous. Their return values are ignored: the dispatcher answers with the contract result (`{ opened: true }`, …, `{ accepted: true }`). To refuse a command, throw or reject. Unsupported commands or missing callbacks fail with `UNKNOWN_COMMAND`; malformed envelopes/payloads fail with `INVALID_PAYLOAD` before any callback runs. Callback failures propagate to the command error boundary for normalization. The helper does not own focus, visibility, input, history or run state; it does not automatically focus after prefill. Consumers choose those behaviors in callbacks. Submit metadata is forwarded separately and must not be treated as a retry message ID.

## Choose a connection

| Deployment                                                                            | Connection                                                                    |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Component, mounted module, or Module Federation remote in the same JavaScript context | Pass `integration.assistantClient` directly; no port transport is needed      |
| Chat inside an iframe or a separate browser window                                    | Establish a cross-window connection; the SDK uses a transferred `MessagePort` |

A separately built assistant does not require an iframe. The iframe adds runtime and styling isolation; the client interface stays the same in either approach.

## Connect a supplied MessagePort

The optional `assistant-bridge/transports/message-port` entry point supplies `connectHostPort` and `connectAssistantPort`. Application code owns iframe creation, peer authentication and port transfer. The SDK owns protocol validation, context initialization, command readiness and channel cleanup. See [connections](connections.md#messageport-connections).

## Connect a same-window assistant

For a directly supplied component or mount API, `connectEmbeddedAssistant(integration, { onStatus })` returns `bridge` and `onReady` properties, plus `dispose()` and `fail()`. `onStatus` is optional; omit it when the host does not show connection state. Its default 10-second timeout covers both loading and receiver registration. Call `onReady(handler)` only once the command receiver is usable, and run the returned cleanup on unmount. Failed or disposed connections cannot become ready later. Reconnection creates a new connection.

A Module Federation remote must expose a component that accepts EmbeddedAssistantOptions: a bridge client and an `onReady(handler, { protocolVersion })` callback that returns cleanup. `useAssistantIntegration` and `useAssistantCommandHandler` pass the version; a custom receiver passes `{ protocolVersion: PROTOCOL_VERSION }`. The host refuses an incompatible or missing version with `PROTOCOL_MISMATCH`. The host loads the remote itself. The SDK connection registers the command handler and marks the assistant ready; the assistant invokes cleanup on unmount. No MessagePort is used in this mode.

## Execute actions from the assistant

Any trusted chat can use the core SDK action executor without importing AG-UI, React, STOMP or a model SDK:

```ts
import { createAssistantActionExecutor } from 'assistant-bridge/chat';

const { executeAction } = createAssistantActionExecutor(bridge, {
  signal: controller.signal,
  requestConfirmation: async ({ name, description, args, entities }) => {
    return showConfirmation({ name, description, args, entities });
  },
});

await executeAction('records.updateStatus', {
  recordId: 'record-012',
  status: 'pending',
});
```

The executor snapshots arguments, checks current capabilities, requests approval for protected actions, rechecks route/entities after approval, forwards the confirmed flag and waits for host context readiness. Without a confirmation callback protected calls fail without dispatch. Rejection preserves `ACTION_REJECTED`; changed entity context yields `STALE_CONTEXT`. Confirmation rendering remains chat-owned. The SDK confirmation controller handles dismissal on cancellation; custom confirmation callbacks must provide their own cancellation handling. Cancellation prevents later dispatch after approval but cannot undo an already executed mutation.

`ActionConfirmation` and `AssistantActionExecutorOptions` are exported from the core SDK. A backend adapter in the chat (AG-UI or any other protocol) should delegate host tool calls to this executor rather than call `requestHostAction` directly. This trusted-client consent boundary does not replace server-side authorization.

## Action readiness

`createAssistantActionExecutor` accepts optional readiness configuration:

```ts
const executor = createAssistantActionExecutor(bridge, {
  signal: controller.signal,
  contextWait: { timeoutMs: 5000, settleMs: 50 },
  readiness: {
    'custom.open': ({ context, previousContext, args, result }) => {
      return (
        context.route === '/custom' &&
        context.targets?.some((target) => target.id === 'custom.loaded') === true
      );
    },
  },
});
```

Predicates receive the latest context, the pre-dispatch context, snapshotted arguments and the action result. They run after a successful dispatch, immediately against the current snapshot and again on context notifications. Returning true starts a quiet window; every notification resets that window. Timeout defaults to 3000 ms, quiet window to 50 ms. Cancellation, timeout and predicate/subscription errors clean up timers/listeners. A readiness failure does not roll back a completed action and must not trigger automatic mutation retries.

By default, `ui.navigate` waits until the published route equals the requested path; override it for custom route formats or additional target requirements. Other actions wait only for the quiet context window. Default navigation rules do not prove that asynchronous data or all UI targets have loaded: supply an explicit predicate when subsequent actions depend on those. Predicates must be synchronous, side-effect free and inspect published context; they cannot query server state asynchronously.

Configuration is supplied where the executor runs, normally in the independent chat application. Functions are not serialized across the iframe or backend protocol. The host publishes the route, targets and entity summaries used by those predicates.

## Action confirmations

`createActionConfirmationController()` from the core SDK owns one pending approval, its promise, abort listener and subscribers. It is independent of React and AG-UI. The executor passes its combined run/client lifetime signal as the optional second argument to `requestConfirmation`; one-argument callbacks also work.

```ts
const confirmations = createActionConfirmationController();
const executor = createAssistantActionExecutor(bridge, {
  signal: runController.signal,
  requestConfirmation: confirmations.requestConfirmation,
});

const unsubscribe = confirmations.subscribe(() => {
  renderConfirmation(confirmations.getSnapshot());
});

// UI decisions must reference the displayed confirmation ID:
confirmations.approve(displayedConfirmation.id);
// or confirmations.reject(displayedConfirmation.id);

// On permanent owner teardown:
unsubscribe();
confirmations.dispose();
```

The snapshot is a `PendingActionConfirmation` (`ActionConfirmation` plus an opaque `id`). Requests are cloned; only one may be pending. Approve resolves true, Reject resolves false, and cancellation rejects. Decisions for old IDs do not approve a newer request. `cancel()` cancels the current request but permits later requests; `dispose()` is terminal and idempotent. Stop/client disconnect/integration disposal automatically cancel a pending confirmation when connected through the executor signal. Controller disposal clears subscribers and prevents future requests.

React consumers use `useActionConfirmation()` from `/react`. It exposes `{ confirmation, requestConfirmation, approve, reject }`; handlers already bind the visible ID. It uses the core controller and disposes on final unmount while remaining safe under Strict Mode effect replay. The chat owns its confirmation card, labels and business-specific presentation. Context is still rechecked after approval by the executor; the SDK does not add automatic dismissal on context updates, a queue, or server authorization.

## Action lifecycle

Every action executed through `createAssistantActionExecutor` has a unique `actionExecutionId`, a monotonic per-execution `sequence` and events:

```text
requested -> awaiting-approval (when required) -> running -> succeeded / failed
                       -> rejected / cancelled
requested -> failed / cancelled
running -> cancelled
```

Subscribe on the host without depending on React or AG-UI:

```ts
const unsubscribe = integration.subscribeActionLifecycle((event) => {
  // event.actionExecutionId, action, status, timestamp, sequence, dispatched, error?
  updateHostFeedback(event);
});
```

A chat passes `onActionLifecycle` to `createAssistantActionExecutor` (or per call through `executeAction`'s third argument):

```ts
const executor = createAssistantActionExecutor(bridge, {
  signal,
  requestConfirmation,
  onActionLifecycle: (event, details) => {
    updateChatProgress(event, details?.args);
  },
});
```

Events are generated once by the executor and forwarded through the direct/MessagePort bridge to the host. `AssistantBridgeClient.publishActionLifecycle` and `subscribeActionLifecycle` are optional for custom clients; built-in clients implement both. Custom clients without them still get executor-local callbacks but cannot forward them without implementing these methods. Unsubscribe when your observer ends; `integration.dispose()` clears host observers.

`executeAction(name, args, execution)` accepts optional execution metadata: an execution ID, the backend's `toolCallId` and a lifecycle listener. Backend adapters pass the tool call ID so lifecycle events, approvals and diagnostics correlate with the backend's tool call.

Confirmation requests include the same optional execution ID. Dispatch envelopes and integration timeline entries carry that ID, correlating approval, bridge request/result diagnostics and backend tool calls. `succeeded` means host dispatch and configured context readiness completed. Rejection/failed validation before dispatch never invokes the handler. Abort produces one `cancelled` terminal event even when a confirmation callback ignores the signal; late promise completion does not turn it into success.

`dispatched: true` conservatively means the execution entered its dispatch phase. Cancellation at/after that point does not prove the business operation stopped, failed, or rolled back; inspect current data before retrying a mutation. A failure may also come from post-dispatch readiness. These events are trusted-client telemetry, not authorization, exactly-once business delivery or proof of a database write. The SDK does not retry automatically.

Wire events contain no arguments or return values. Errors use the shared safe catalog. Local listener `details.args` is a separate cloned presentation snapshot, never forwarded or added to diagnostics. Observer exceptions do not change action outcomes. The host validates event shape, sequence and transitions, ignores duplicate/terminal updates, and retains at most 256 execution states for telemetry validation. This bounded history is cleared on disposal; disconnected hosts or states evicted from that window may miss later telemetry. Do not use this stream as an audit database.

This lifecycle belongs to the host/chat bridge, not to the chat's backend protocol. Visual labels, toasts, history persistence and business decisions remain application-owned.

## Action schemas

Actions keep their Zod `parametersSchema` for TypeScript inference and host-side `safeParse` validation. Advertised capabilities use Zod 4 `z.toJSONSchema(schema, { io: 'input', target: 'draft-7' })`, preserving enum values, required/optional fields, nested objects/arrays, descriptions and representable constraints for the model. The input representation describes what callers send; Zod still applies defaults and transforms when executing the action. Unknown fields follow the input schema's policy (ordinary Zod objects accept and strip them).

No separate hand-maintained JSON Schema is required. Custom types that Zod cannot express as JSON Schema cause capability generation to throw instead of silently advertising a misleading generic schema. Custom refinements and other runtime-only checks are not guaranteed to appear in JSON Schema; the host's Zod validation remains authoritative. This does not change action availability, confirmation requirements or execution permissions.

## Protocol versions

`PROTOCOL_VERSION` (`MAJOR.MINOR.PATCH`) is the version of the host/assistant messages and results. Peers with the same MAJOR are compatible; `isCompatibleProtocolVersion(version)` checks it.

- Every request and result envelope carries `protocolVersion`, and the schemas accept any compatible version.
- When they connect, the assistant sends its version (over a supplied port, or `onReady(handler, { protocolVersion })` for same-window connections) and the host refuses an incompatible or missing one. The connection then fails with status `error` and an `IntegrationDiagnostic` with code `PROTOCOL_MISMATCH`, instead of timing out or rejecting later with `INVALID_PAYLOAD`. Over a MessagePort, the chat also checks the host's version.
- A new MAJOR is required when a message, payload or result changes in a way an existing peer would reject or misread: a renamed or removed field, a new required field, a changed result. Adding an optional field or a new command or action is a MINOR change. Both sides must then be updated together.

`2.0.0` introduced the typed command results. An assistant or host built with an earlier SDK is incompatible.

## Integration errors

`normalizeIntegrationError(error)` returns only `{ code, message }`: recognized SDK codes are preserved and messages come from a shared safe catalog. Unknown codes, untyped exceptions, string rejections and misleading code names embedded in message text fall back to `EXECUTION_FAILED`. Raw handler messages, stacks and extra fields are not forwarded. `createIntegrationError(ERROR_CODES.TIMEOUT)` creates a standard `Error` carrying the same safe code/message; compare `error.code` with `ERROR_CODES` from `/contracts`.

Requests that fail (`requestHostAction`, `executeAction`, host commands) reject with an `Error` that also carries `code`, `message` and, where allowed, `reason`. Both `error instanceof Error` and `error.code` work; the message is the safe one described here.

Registry execution, same-window command handlers, request/result channels and the MessagePort transport use this policy. SDK readiness waits emit `TIMEOUT`; unavailable actions and missing UI targets have explicit codes. `ACTION_REJECTED` is the SDK error code for user rejection. Backend adapters should check codes instead of guessing categories from message text. Provider/run errors remain a separate backend concern; this API normalizes integration failures, not arbitrary provider-specific codes.

Host handlers should throw an error/object with a supported `code`. Handler messages are not part of the public error contract. Inspect `code` for branching and translate it in application UI if needed. Unknown custom codes are intentionally not transported unchanged.

## Public rejection reasons

Hosts can attach an optional public reason to `ACTION_NOT_AVAILABLE`:

```ts
throw createIntegrationError(ERROR_CODES.ACTION_NOT_AVAILABLE, {
  code: 'SELECTION_REQUIRED',
  message: 'Select an item before continuing.',
});
```

The reason code is host-owned (uppercase letters, digits and underscores, up to 64 characters).
Its message is explicitly public text, limited to 300 characters: never include secrets, raw API
responses or exception details. Valid reasons survive direct/MessagePort errors, so a chat can pass them to the model as
the tool result. Other errors and invalid reasons retain safe catalog messages.
The SDK does not interpret business codes or navigate automatically. No reason is required.

When a handler's own error messages are already safe for the user, such as validation messages from your backend, set `exposeErrorMessages` instead of wrapping every handler:

```ts
defineAction({
  name: 'cms.publishEntry',
  description: 'Publish an entry.',
  schema: publishSchema,
  requiresConfirmation: true,
  exposeErrorMessages: true,
  handler: ({ entryId }) => api.publish(entryId), // a thrown Error's message reaches the assistant
});
```

An ordinary `Error` then becomes `ACTION_NOT_AVAILABLE` with reason code `ACTION_FAILED` and the error message (trimmed, at most 300 characters). Errors created with `createIntegrationError`, non-`Error` values and empty messages are handled as before. Without the option, handler messages never leave the host.

## Diagnostics, timeouts and failures

Use the `onTimeline` callback; no separate logger or logging service is installed:

```ts
onTimeline: (entry) => {
  if (entry.diagnostic) {
    const { code, phase, mode, message, errorCode } = entry.diagnostic;
    // Forward these fields and entry.requestId to your own logger or UI.
  }
};
```

`IntegrationDiagnostic` is exported from the root SDK. Diagnostic entries use the timeline event channel and have `result.success: false`. The SDK does not automatically write to the console or send telemetry. `CONNECTION_FAILED` describes an explicitly failed generic connection. All current diagnostics describe failures; intentional disposal emits no failure diagnostic. Connection timeouts/failures are emitted once per failed connection; late completion cannot reactivate it.

| Codes                                                                                   | Phase                             |
| --------------------------------------------------------------------------------------- | --------------------------------- |
| `IFRAME_HANDSHAKE_TIMEOUT`, `IFRAME_HANDSHAKE_FAILED`                                   | `handshake`                       |
| `FEDERATION_ADAPTER_TIMEOUT`, `FEDERATION_ADAPTER_LOAD_FAILED`                          | `adapter-load`                    |
| `FEDERATION_RUNTIME_UNAVAILABLE`, `FEDERATION_LOAD_FAILED`, `FEDERATION_EXPORT_MISSING` | `remote-load`                     |
| `FEDERATION_RENDER_FAILED`                                                              | `render`                          |
| `CONNECTION_TIMEOUT`                                                                    | `remote-load` or `receiver-ready` |
| `ACTION_FAILED`, `COMMAND_FAILED`                                                       | `action` or `command`             |

Connection diagnostics include `mode` (`message-port` or `embedded`). Action/command diagnostics include the correlated timeline `requestId` and protocol `errorCode` when available. They omit mode because the core request can originate outside an embedding adapter. Remote loading and render failures are host-owned and do not appear as SDK connection diagnostics.

Request payload summaries read `Payload omitted`. Failure summaries use generic messages, and diagnostics omit raw prompts, payloads, remote URLs and exception text. Context/selection timeline entries still contain host-provided routes and entity identifiers; the timeline is not a universal data redactor. The host owns log retention, filtering and destinations.

Consumers can forward structured diagnostics from `onTimeline` to their own UI or logging service. The SDK does not persist a timeline.

- The connection APIs (`connectEmbeddedAssistant`, `connectHostPort`, `connectAssistantPort`) manage readiness, availability, receiver cleanup and connection timeouts. Dispose them when removing the assistant; pending host commands are then rejected.
- Unsubscribe context and lifecycle listeners when disconnecting.
- Call `integration.dispose()` when the host integration is permanently disposed. It owns SDK cleanup; host components still own their DOM and rendering lifecycle.

Host bridge action and command timeouts default to 10 seconds and can be configured using `actionTimeoutMs` and `commandTimeoutMs` in `createHostIntegration`. These options do not change the port adapter's separate fixed timeout. Timing out a request does not cancel or roll back an action handler that has already started.

Common host-side failures include `UNKNOWN_ACTION`, `INVALID_PAYLOAD`, `ACTION_NOT_AVAILABLE`, `STALE_CONTEXT`, `RECEIVER_UNAVAILABLE`, `TIMEOUT`, and `EXECUTION_FAILED`. Use `onTimeline` to inspect request IDs, directions, results, and durations. Treat payload summaries as application data when deciding where to store logs.

`requiresConfirmation` is enforced by the registry: protected calls without a separate `confirmed` flag return `CONFIRMATION_REQUIRED`. The chat adapter must collect explicit approval before forwarding that flag. Application authentication and server authorization remain host/backend responsibilities. Published capability schemas are a simplified description; the registered Zod schema is the runtime validator.

## Dispose the integration

```ts
const integration = createHostIntegration({ actions });

// When the host integration permanently ends:
integration.dispose();
```

`dispose()` is synchronous and idempotent. It closes SDK-managed same-window/MessagePort connections, cancels their loading timers, rejects pending action/command requests with `RECEIVER_UNAVAILABLE`, clears active highlights and timers, and releases target/context subscriptions and registered action handlers. The instance is terminal: do not reuse it; create a new integration to reconnect. Calls to `updatePage` or new connection setup after disposal fail; later action/command requests reject immediately without new timers.

`AssistantHost` calls `dispose()` automatically on final unmount while preserving Strict Mode replay behavior. An integration you create with `createHostIntegration` is yours to dispose. Component-level connection cleanup remains safe to call before or after the integration is disposed.

`AssistantBridgeClient.signal` (optional on custom clients) indicates that the client connection or integration ended. Built-in clients provide the signal; custom clients can omit it for compatibility. Readiness waits listen to both caller cancellation and client lifetime. The MessagePort transport sends an internal `disconnect` notification so the chat-side client can reject pending requests and abort its lifetime signal. This is part of the host/chat bridge, not the chat's backend protocol.

Disposal does not remove host DOM, unload federation runtime caches, cancel arbitrary already-running handler promises, roll back completed mutations or stop independently owned BFF/model runs. Confirmation UI and per-run cancellation remain owned by the chat application. The SDK prevents later dispatch after an awaited confirmation if its client lifetime ended.

## Host-owned approval previews and normalized outcomes

Action definitions can supply `preview(payload, context)` alongside the handler.
Its result is plain text: `{ title: string, details: string[] }`. Titles are bounded
to 200 characters, details to 200 lines of at most 2000 characters each. Previews
must be read-only. The registry validates the payload, action availability and
minimum context revision before invoking the callback. It applies the same public
error policy as execution. An invalid preview fails before approval.

Built-in clients expose `previewHostAction(name, args, contextRevision?)`.
The executor requests it only for a capability with `hasPreview: true`, then
passes it as `ActionConfirmation.preview` to custom or built-in approval UI.
Context changes during preview/approval still prevent stale dispatch. The normal
handler and backend checks remain the write boundary. Cancellation prevents later
approval/dispatch; it does not roll back or cancel arbitrary host callback work.

Protocol `2.1.0` adds `action.preview.request` and `action.preview.result` messages
on MessagePort. They use the action request/result envelopes on a separate,
read-only path. A preview is never encoded as an execution flag that an older peer
could ignore. The optional `hasPreview` capability enables feature detection.
Old hosts without it keep generic approval; old assistants can still execute the
unchanged action protocol with generic approval. Custom clients used with new
preview capabilities must implement `previewHostAction` or the executor fails
closed. Protocol MAJOR compatibility remains unchanged.

`createAssistantActionExecutor(client, options).executeActionResult(name, args,
execution?)` returns `{ status: 'succeeded', data }` or
`{ status: 'rejected' | 'cancelled' | 'failed', error: StructuredError }`.
React exposes the same behavior through `executeHostActionResult`. Public
business reasons are preserved; arbitrary exception messages stay private.
The existing throwing execution methods remain available.
