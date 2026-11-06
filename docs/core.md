# Core API

The framework-independent API of `assistant-bridge`. It has no React, federation or AG-UI imports.

<pre>
├─ Overview
│  └─ <a href="#building-blocks">HostActionRegistry, HostContextManager, UiTargetRegistry, HostBridge, TypedEventBus, RequestResponseChannel</a>
├─ Host setup
│  ├─ <a href="#create-the-host-integration">createHostIntegration</a>
│  ├─ <a href="#define-host-actions">defineAction</a>
│  ├─ <a href="#define-host-actions">navigateAction, highlightAction, scrollToAction, focusAction, selectAction, openDetailsAction</a>
│  └─ <a href="#compose-common-ui-actions">createUiActions</a>
├─ Host context
│  ├─ <a href="#update-the-page">integration.updatePage</a>
│  ├─ <a href="#publish-context">contextManager, syncCapabilities</a>
│  ├─ <a href="#context-commits">Context commits and revisions</a>
│  ├─ <a href="#define-page-catalog">definePageCatalog</a>
│  └─ <a href="#map-host-entities">mapHostEntities</a>
├─ Assistant client and commands
│  ├─ <a href="#use-the-client-inside-the-assistant">AssistantBridgeClient</a>
│  ├─ <a href="#send-commands-from-the-host">assistantCommands, attachAssistantCommandHandler</a>
│  ├─ <a href="#send-commands-from-the-host">askAbout, prefillAndOpen</a>
│  └─ <a href="#dispatch-assistant-commands">createAssistantCommandDispatcher</a>
├─ Connections
│  ├─ <a href="#connect-an-iframe">connectIframe, connectAssistantIframe, createAssistantIframeUrl</a>
│  ├─ <a href="#connect-an-iframe">attachHostPort, createPortAssistantClient</a>
│  └─ <a href="#connect-a-same-window-assistant">connectEmbeddedAssistant</a>
├─ Action execution
│  ├─ <a href="#execute-actions-from-the-assistant">createAssistantActionExecutor</a>
│  ├─ <a href="#action-readiness">defaultActionReadiness, waitForHostContext</a>
│  ├─ <a href="#action-confirmations">createActionConfirmationController</a>
│  ├─ <a href="#action-lifecycle">subscribeActionLifecycle</a>
│  ├─ <a href="#action-progress">reduceActionProgress, finalizeActionProgress</a>
│  └─ <a href="#action-schemas">Zod to JSON Schema capabilities</a>
└─ Errors and lifecycle
   ├─ <a href="#integration-errors">createIntegrationError, normalizeIntegrationError, isIntegrationErrorCode</a>
   ├─ <a href="#public-rejection-reasons">Public rejection reasons</a>
   ├─ <a href="#diagnostics-timeouts-and-failures">onTimeline, IntegrationDiagnostic</a>
   └─ <a href="#dispose-the-integration">integration.dispose</a>
</pre>

## Building blocks

| API                                            | Responsibility                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `createHostIntegration`                        | Creates and connects the bridge, action registry, context manager, target registry, and client APIs |
| `AssistantBridgeClient`                        | Assistant-facing access to host context and action requests                                         |
| `HostAssistantCommands`                        | Host-facing commands: open, close, focus, prefill, and submit prompt                                |
| `HostActionRegistry`                           | Validates action payloads with Zod, checks availability, and executes registered handlers           |
| `HostContextManager`                           | Publishes route, page, selection, capabilities, and revision updates                                |
| `UiTargetRegistry`                             | Resolves host-owned targets for highlighting, scrolling, focusing, and selecting                    |
| `HostBridge`                                   | Coordinates requests, results, readiness, context events, and integration timeline entries          |
| `TypedEventBus` / `RequestResponseChannel`     | Typed in-memory events and correlated request/result handling                                       |
| `attachHostPort` / `createPortAssistantClient` | Adapt the bridge to a private `MessagePort`, used by the iframe integration                         |

The SDK does not provide a chat interface, model provider, backend, conversation storage, or host-specific business logic. Both real and simulated assistants can use the same client interface.

`attachAssistantCommandHandler` connects a same-window command receiver to the host bridge. `AssistantCommandHandler` and `EmbeddedAssistantOptions` define the framework-independent embedding contract.

## Create the host integration

Create one integration for the lifetime of the host application. Register only the actions that application intends to expose.

```ts
import { createHostIntegration, navigateAction } from 'assistant-bridge';

const integration = createHostIntegration({
  initialRoute: '/',
  initialPage: { title: 'Dashboard', type: 'dashboard' },
  actions: [
    navigateAction({
      navigate: (path) => window.history.pushState(null, '', path),
      allowedRoutes: ['/', '/catalog', '/records'],
    }),
  ],
  onTimeline: (entry) => console.debug(entry),
});
```

The navigation callback is illustrative. In a routed application, supply its router's navigation function so route rendering and context updates stay coordinated. The callback may return a promise: the action result waits for it, and a rejection fails the action, so hosts can apply route preconditions or wait for page data.

The returned integration exposes `bridge`, `contextManager`, `actionRegistry`, `targetRegistry`, `assistantCommands`, and `assistantClient`. Keep those host services on the host side; give assistant application logic only `AssistantBridgeClient`.

## Define host actions

Use `defineAction` for application-specific behavior. Its Zod schema validates incoming payloads before the handler runs; `available` can restrict execution to an appropriate host context.

```ts
import { defineAction, recordsFilterPayloadSchema } from 'assistant-bridge';

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
    schema: recordsFilterPayloadSchema,
    available: (context) => context.route.startsWith('/records'),
    handler: (payload) => {
      applyFilters(payload);
      return { applied: payload };
    },
  });
```

An action name or exported schema does not register a handler automatically. The host must supply the action explicitly.

Built-in action factories are `navigateAction`, `highlightAction`, `scrollToAction`, `focusAction`, `selectAction`, and `openDetailsAction`. UI-target actions operate on targets registered by the host. The action factory callback provides the shared registry:

```ts
import { createHostIntegration, focusAction, highlightAction } from 'assistant-bridge';

const integration = createHostIntegration({
  actions: ({ targets }) => [highlightAction(targets), focusAction(targets)],
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
    details: { open: openDetails },
  }),
  // Add host-specific actions with defineAction(...).
];
```

`createUiActions` returns `HostActionInput[]` without registering or executing anything. Pass the result to `createHostIntegration` or `useHostIntegration`. Omitted groups enable no actions; `{}` returns an empty list. Target action names are explicitly selected and duplicate selections are included once, in their first-occurrence order. **`UI_TARGET_ACTIONS`** lists every built-in UI-target tool so hosts can enable the full set without repeating names; slice or replace it for a tighter surface. Navigation is emitted first, then selected target actions, then details.

`CreateUiActionsOptions` and `UiTargetActionName` are exported for typed configuration. The helper delegates to the individual action factories, preserving their schemas, route checks and errors. Those factories remain available separately. Hosts still own allowed routes, detail URL mapping, target IDs and business handlers; the helper adds no catalog/records store access or implicit permissions.

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
integration.contextManager.setRoute('/catalog', {
  title: 'Catalog',
  type: 'catalog-list',
});

// Updates selection and also emits host.entity.selected.
integration.bridge.publishEntitySelected('catalog', 'product-001');

integration.contextManager.clearSelection();
```

Context includes `route`, `page`, optional `selection`, registered `capabilities`, and an incrementing `revision`. Publish route and selection changes from the host; the SDK does not observe the router or DOM itself.

If actions are registered or removed after initialization, call `integration.bridge.syncCapabilities()` to refresh the published capabilities. The capability list describes registered actions; context-specific `available` checks still run during execution.

## Context commits

`integration.updatePage({ route, page, selection, entities })` applies a page change, optional selection clearing, entity summaries and derived action availability in one context commit. Context subscribers see at most one revision for that update, with capabilities computed against the new page/entities. Target registrations and later data changes remain separate updates.

The core `HostContextManager` owns value equality and revision generation for all consumers. Repeating equivalent setter/update values does not notify subscribers or increment `revision`; object property order and omitted/undefined optional fields are equivalent for JSON context data. Revisions count effective published changes, not method calls.

Inputs, snapshots and each subscriber notification are deeply cloned, including page, selection, destinations, targets, entities and nested capability schemas. Mutating a returned snapshot or an input after assignment cannot alter stored state or another subscriber's notification. Reentrant updates are queued so subscribers observe revisions in order.

Repeated identical `updatePage` calls preserve current selection/highlights. Selection policy applies when route, page metadata or policy changes. Use `contextManager.clearSelection()` for an explicit same-page selection reset. Core `updatePage` preserves entities when omitted; the React `useHostPageContext` hook supplies an empty array by default to clear old page summaries. Hosts still own routing policy, entity mapping and action availability rules.

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
    navigateAction({ navigate, allowedRoutes: catalog.paths }),
    // ...
  ],
});

integration.updatePage({
  route: catalog.route('catalog'),
  page: catalog.pageMeta('catalog'),
});
```

Use `catalog.pageKeyFromRoute(pathname)`, `catalog.isRoute(context, 'dashboard')`, and `catalog.isPageType(context, 'dashboard')` in navigation guards and action `available` predicates. The helper does not register routes, watch a router or choose entity payloads.

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

## Use the client inside the assistant

```ts
import type { AssistantBridgeClient, HostContext } from 'assistant-bridge';

const connectAssistant = (
  client: AssistantBridgeClient,
  renderContext: (context: HostContext) => void,
) => {
  renderContext(client.getInitialContext());
  const unsubscribe = client.subscribeContext(renderContext);

  const openCatalog = async () => {
    const context = client.getInitialContext();
    return client.requestHostAction('ui.navigate', { path: '/catalog' }, context.revision);
  };

  return { openCatalog, dispose: unsubscribe };
};
```

Despite its name, `getInitialContext()` returns the latest available snapshot. `subscribeContext()` receives subsequent changes and returns an unsubscribe function. An action request resolves to the handler's returned data or rejects on failure.

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

The receiver must implement these commands and return correlated results. The SDK does not create or open a panel itself. `submitPrompt()` completion means the receiver returned a command result; it does not inherently mean response streaming has finished.

For a same-window receiver, use `attachAssistantCommandHandler(integration.bridge, handler)`. It validates command envelopes and emits correlated results from the handler's return value or rejection. The handler must validate command-specific payloads and reject unsupported commands. The returned function detaches the receiver; the host also calls `notifyAssistantUnmounted()` when disconnecting.

For an iframe receiver, the port adapter forwards command requests to the `onCommand` callback passed to `createPortAssistantClient` and creates the result envelope from its return value or rejection.

Host command helpers combine these commands:

```ts
await integration.assistantCommands.askAbout('Explain this item', { type: 'catalog', id });
await integration.assistantCommands.prefillAndOpen('Review current selection');
```

`askAbout` publishes an optional selection, opens the assistant, then submits the prompt with the current context revision. `prefillAndOpen` opens before prefilling.

## Dispatch assistant commands

`createAssistantCommandDispatcher` validates the standard command envelope and prefill/submit payloads, then invokes supplied callbacks:

```ts
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

Callbacks may return synchronously or asynchronously. Explicit callback results are preserved; null/undefined results receive the normal opened/closed/focused/prefilled/acknowledged response. Unsupported commands or missing callbacks fail with `UNKNOWN_COMMAND`; malformed envelopes/payloads fail with `INVALID_PAYLOAD` before any callback runs. Callback failures propagate to the command error boundary for normalization. The helper does not own focus, visibility, input, history or run state; it does not automatically focus after prefill. Consumers choose those behaviors in callbacks. Submit metadata is forwarded separately and must not be treated as a retry message ID.

## Choose a connection

| Deployment                                                                            | Connection                                                                    |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Component, mounted module, or Module Federation remote in the same JavaScript context | Pass `integration.assistantClient` directly; no port transport is needed      |
| Chat inside an iframe or a separate browser window                                    | Establish a cross-window connection; the SDK uses a transferred `MessagePort` |

A separately built assistant does not require an iframe. The iframe adds runtime and styling isolation; the client interface stays the same in either approach.

## Connect an iframe

For iframe embedding, create the URL with `createAssistantIframeUrl(url, window.location.origin)`, render it in the host's iframe and connect:

```ts
const disconnect = integration.connectIframe({
  iframe,
  url: assistantUrl,
  onStatus: (status) => console.log(status),
});
```

The SDK verifies the exact iframe origin and source, creates/transfers the private port, waits for acknowledgement, handles frame reload sessions and reports `loading`, `ready` or `error`. The default handshake timeout is 8 seconds; override it with `timeoutMs`. Call `disconnect()` when removing the frame or replacing the connection.

Inside the chat:

```ts
const disconnect = connectAssistantIframe({
  hostOrigin,
  onCommand,
  onClient,
  onContext,
});
```

`hostOrigin` must be the intended parent origin. The SDK checks parent source/origin and validates the initial context before exposing the client. The chat remains responsible for executing its commands and rendering context. Standalone windows do not connect.

For the iframe integration:

Both applications import `ASSISTANT_IFRAME_MESSAGES` from the SDK for the brand-neutral readiness, connection, and acknowledgement handshake names. Assistant instance IDs describe the adapter (`assistant-iframe` or `assistant-federation`).

1. The chat announces readiness to its configured host origin.
2. The host checks the message's exact `origin` and `source` against the intended iframe.
3. The host creates a `MessageChannel`, calls `attachHostPort(port1, integration.bridge)`, and transfers `port2` with a context snapshot to the verified iframe origin.
4. The chat verifies the parent origin/source, validates the context, and calls `createPortAssistantClient(port2, context, onCommand)`.
5. After the chat acknowledges the connection, the host marks the assistant ready. Application logic uses the returned `client` as `AssistantBridgeClient`.

The port adapters validate envelopes, correlate requests, forward context and commands, enforce a fixed 10-second port request timeout, and reject pending requests when disposed. The port layer currently converts remote failures into `Error` messages; structured error codes are not preserved end-to-end through that adapter.

The high-level iframe connection APIs own the window handshake and exact origin/source checks. The host owns iframe rendering, visibility and the reconnect button. Low-level `attachHostPort` remains available, but callers using it directly must perform their own window checks. See [assistant-side React hooks](react.md#assistant-side-hooks) for the assistant connection.

## Connect a same-window assistant

For a directly supplied component or mount API, `connectEmbeddedAssistant(integration, { onStatus })` returns `bridge` and `onReady` properties, plus `dispose()` and `fail()`. Its default 10-second timeout covers both loading and receiver registration. Call `onReady(handler)` only once the command receiver is usable, and run the returned cleanup on unmount. Failed or disposed connections cannot become ready later. Reconnection creates a new connection.

For a same-window integration, attach the command handler before announcing readiness with `integration.bridge.notifyAssistantReady('my-assistant')`.

A Module Federation remote must expose a component that accepts EmbeddedAssistantOptions: a bridge client and an onReady(handler) callback that returns cleanup. The SDK connection adapter registers the command handler and marks the assistant ready; the assistant invokes cleanup on unmount. No MessagePort is used in this mode.

## Execute actions from the assistant

Any trusted chat can use the core SDK action executor without importing AG-UI, React, STOMP or a model SDK:

```ts
import { createAssistantActionExecutor } from 'assistant-bridge';

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

`ActionConfirmation` and `AssistantActionExecutorOptions` are exported from the core SDK. The `/ag-ui` entry also re-exports `ActionConfirmation`. `createHostAgentOptions` delegates action execution to this executor and retains only AG-UI tool/context mapping. This trusted-client consent boundary does not replace server-side authorization.

## Action readiness

`createAssistantActionExecutor` and `createHostAgentOptions` accept the same optional readiness configuration:

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

`defaultActionReadiness` provides rules for `ui.navigate` (exact requested route) and `ui.openDetails` (route ending in the requested entity ID); override either for custom route formats or additional target requirements. Other actions wait only for the quiet context window. Default navigation rules do not prove that asynchronous data or all UI targets have loaded: supply an explicit predicate when subsequent actions depend on those. Predicates must be synchronous, side-effect free and inspect published context; they cannot query server state asynchronously.

`waitForHostContext(bridge, predicate, { signal, timeoutMs, settleMs })` is also exported for direct use. Configuration is supplied where the executor runs, normally in the independent chat application. Functions are not serialized across the iframe/AG-UI protocol. The host publishes the route, targets and entity summaries used by those predicates.

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

A generic chat can pass `onActionLifecycle` to `createAssistantActionExecutor`; an AG-UI chat passes it to `runWebSocketAgent` together with `executeTool` from `createHostAgentOptions`:

```ts
const host = createHostAgentOptions(bridge, { signal, requestConfirmation });

await runWebSocketAgent({
  ...runOptions,
  input: { ...runOptions.input, tools: host.tools, context: host.context },
  executeTool: host.executeTool,
  getHostState: host.getHostState,
  onActionLifecycle: (event, details) => {
    updateChatProgress(event, details?.args);
  },
});
```

Events are generated once by the executor and forwarded through the direct/iframe bridge to the host. `AssistantBridgeClient.publishActionLifecycle` and `subscribeActionLifecycle` are optional for custom clients; built-in clients implement both. Custom clients without them still get executor-local callbacks but cannot forward them without implementing these methods. Unsubscribe when your observer ends; `integration.dispose()` clears host observers.

The AG-UI adapter supplies optional execution metadata as the third `executeTool(name, args, execution)` argument: an execution ID, `toolCallId` and lifecycle listener. The SDK executor handles it. Custom execute functions may ignore it, but must delegate or implement that metadata callback to produce lifecycle events. The AG-UI adapter does not generate a second lifecycle. Chat UIs can use `onToolActivity` or `onActionLifecycle`.

Confirmation requests include the same optional execution ID. Dispatch envelopes and integration timeline entries carry that ID, correlating approval, bridge request/result diagnostics and AG-UI tool calls. `succeeded` means host dispatch and configured context readiness completed. Rejection/failed validation before dispatch never invokes the handler. Abort produces one `cancelled` terminal event even when a confirmation callback ignores the signal; late promise completion does not turn it into success.

`dispatched: true` conservatively means the execution entered its dispatch phase. Cancellation at/after that point does not prove the business operation stopped, failed, or rolled back; inspect current data before retrying a mutation. A failure may also come from post-dispatch readiness. These events are trusted-client telemetry, not authorization, exactly-once business delivery or proof of a database write. The SDK does not retry automatically.

Wire events contain no arguments or return values. Errors use the shared safe catalog. Local listener `details.args` is a separate cloned presentation snapshot, never forwarded or added to diagnostics. Observer exceptions do not change action outcomes. The host validates event shape, sequence and transitions, ignores duplicate/terminal updates, and retains at most 256 execution states for telemetry validation. This bounded history is cleared on disposal; disconnected hosts or states evicted from that window may miss later telemetry. Do not use this stream as an audit database.

This lifecycle belongs to the host/chat bridge, not to the BFF AG-UI/WebSocket/STOMP contract. Visual labels, toasts, history persistence and business decisions remain application-owned.

## Action progress

The core SDK exports `reduceActionProgress`, `finalizeActionProgress` and `ActionProgressEntry`. Consumers keep their own labels and storage:

```ts
const actions = reduceActionProgress(previousActions, event, {
  label: describeAction(event.action),
});
const finalActions = finalizeActionProgress(actions, 'stopped'); // or failed
```

The reducer upserts by `actionExecutionId`, preserves list order, ignores duplicate/older sequences and never resurrects terminal entries. Canonical ID/status/sequence/dispatch/error fields come from the lifecycle event; presentation fields remain consumer-owned. Inputs are not mutated; ignored updates return the original array. Finalization changes only unfinished entries, preserving completed/rejected/cancelled outcomes and the dispatch uncertainty flag. The `stopped` status is also supported for saved chat histories.

## Action schemas

Actions keep their Zod `parametersSchema` for TypeScript inference and host-side `safeParse` validation. Advertised capabilities use Zod 4 `z.toJSONSchema(schema, { io: 'input', target: 'draft-7' })`, preserving enum values, required/optional fields, nested objects/arrays, descriptions and representable constraints for the model. The input representation describes what callers send; Zod still applies defaults and transforms when executing the action. Unknown fields follow the input schema's policy (ordinary Zod objects accept and strip them).

No separate hand-maintained JSON Schema is required. Custom types that Zod cannot express as JSON Schema cause capability generation to throw instead of silently advertising a misleading generic schema. Custom refinements and other runtime-only checks are not guaranteed to appear in JSON Schema; the host's Zod validation remains authoritative. This does not change action availability, confirmation requirements or execution permissions.

## Integration errors

`normalizeIntegrationError(error)` returns only `{ code, message }`: recognized SDK codes are preserved and messages come from a shared safe catalog. Unknown codes, untyped exceptions, string rejections and misleading code names embedded in message text fall back to `EXECUTION_FAILED`. Raw handler messages, stacks and extra fields are not forwarded. `createIntegrationError(ERROR_CODES.TIMEOUT)` creates a standard `Error` carrying the same safe code/message; `isIntegrationErrorCode(value)` checks supported codes.

Registry execution, same-window command handlers, request/result channels, iframe transport and AG-UI host tool outcomes use this policy. SDK readiness waits emit `TIMEOUT`; unavailable actions and missing UI targets have explicit codes. `ACTION_REJECTED` is the SDK error code for user rejection. The AG-UI adapter checks codes instead of guessing categories from arbitrary message text. Provider/run errors remain a separate BFF concern; this API normalizes integration failures, not arbitrary provider-specific codes.

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
responses or exception details. Valid reasons survive direct/iframe errors and become structured
AG-UI tool result content for the model. Other errors and invalid reasons retain safe catalog messages.
The SDK does not interpret business codes or navigate automatically. No reason is required.

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

Connection diagnostics include `mode` (`iframe`, `federation` or `embedded`). Action/command diagnostics include the correlated timeline `requestId` and protocol `errorCode` when available. They omit mode because the core request can originate outside an embedding adapter. Failed remote loading is reported generically when the runtime cannot distinguish a network failure from an exposure-resolution failure; raw exception text is not copied into diagnostics.

Request payload summaries read `Payload omitted`. Failure summaries use generic messages, and diagnostics omit raw prompts, payloads, remote URLs and exception text. Context/selection timeline entries still contain host-provided routes and entity identifiers; the timeline is not a universal data redactor. The host owns log retention, filtering and destinations.

Consumers can forward structured diagnostics from `onTimeline` to their own UI or logging service. The SDK does not persist a timeline.

- High-level connection APIs manage readiness, availability, receiver cleanup and connection timeouts. Dispose them when removing the assistant. The following low-level operations remain available for custom adapters.
- Call `bridge.notifyAssistantReady(id)` only after the command receiver is usable.
- Call `bridge.setAssistantAvailable(false)` for temporary unavailability; pending host commands are rejected.
- Call `bridge.notifyAssistantUnmounted()` when removing the receiver.
- Unsubscribe context/event listeners and dispose both port adapters when disconnecting.
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

`dispose()` is synchronous and idempotent. It closes SDK-managed iframe/embedded/federation connections, cancels their loading timers, rejects pending action/command requests with `RECEIVER_UNAVAILABLE`, clears active highlights and timers, and releases target/context subscriptions and registered action handlers. The instance is terminal: do not reuse it; create a new integration to reconnect. Calls to `updatePage` or new connection setup after disposal fail; later action/command requests reject immediately without new timers.

`useHostIntegration` calls `dispose()` automatically on final unmount while preserving Strict Mode replay behavior. `IntegrationProvider` only shares the instance and does not dispose an externally supplied integration. Component-level connection cleanup remains safe to call before or after the integration is disposed.

`HostBridge.signal` and optional `AssistantBridgeClient.signal` indicate SDK lifetime termination. Built-in clients provide the signal; custom clients can omit it for compatibility. Readiness waits listen to both caller cancellation and client lifetime. The iframe port sends an internal `disconnect` notification so the chat-side client can reject pending requests and abort its lifetime signal. This is part of the host/chat bridge, not the BFF AG-UI transport contract.

Disposal does not remove host DOM, unload federation runtime caches, cancel arbitrary already-running handler promises, roll back completed mutations or stop independently owned BFF/model runs. Confirmation UI and per-run cancellation remain owned by the chat application. The SDK prevents later dispatch after an awaited confirmation if its client lifetime ended.
