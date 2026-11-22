# Changelog

## 1.0.0-rc.1

### Breaking

The public API is reduced to its 1.0 surface. Removed exports have no deprecation period.

- Contracts are exported only from `assistant-bridge/contracts`. Import `ERROR_CODES`,
  `ASSISTANT_COMMAND_NAMES`, `PROTOCOL_VERSION`, `isCompatibleProtocolVersion`, every
  `*Schema` and the contract types (`HostContext`, `ActionPreview`, `ActionLifecycleEvent`,
  …) from there instead of the root.
- New entries `assistant-bridge/chat` and `assistant-bridge/chat/react` hold the assistant
  side. Move `createAssistantActionExecutor`, `createActionConfirmationController`,
  `createAssistantCommandDispatcher`, `AssistantBridgeClient`, `EmbeddedAssistantOptions` and
  the executor and confirmation types to `/chat`, and `useAssistantIntegration`,
  `useAssistantContext`, `useAssistantCommandHandler` and `useActionConfirmation` to
  `/chat/react`. The host keeps `connectEmbeddedAssistant` in the root.
- Remove `IntegrationProvider`, `useIntegration`, `useOptionalIntegration`,
  `useHostIntegration`, `useHostPageContext` and `HIGHLIGHT_ATTRIBUTE` from `/react`. Use
  `AssistantHost` and `useAssistantHost()` (which returns `null` outside a host); without
  React, use `createHostIntegration`.
- Remove the individual action factories `navigateAction`, `focusAction`, `highlightAction`,
  `scrollToAction`, `selectAction`, `setValueAction`, `setCheckedAction`, `setExpandedAction`,
  `activateTabAction` and `clearHighlightAction`. Use `createUiActions({ navigation, targets })`.
- Remove `isIntegrationErrorCode`; compare `error.code` with `ERROR_CODES`.

## 0.1.0-beta.11

### Breaking

- Remove `/federation`, `/react/federation`, `AssistantEmbed`, `AssistantIframe`, iframe connection helpers and iframe handshake constants. The host owns remote loading, mounting, URLs and retry. See [migration](docs/connections.md).
- Remove `iframe` options and implicit initialization from `useAssistantIntegration`. Supply `bridge`/`onReady` explicitly; without a bridge the chat stays standalone.
- Replace embedding-specific diagnostics with communication diagnostics (`embedded` / `message-port`). Loading/render failures belong to the application.

### Added

- Optional `/transports/message-port` connects a caller-authenticated private channel without inspecting windows or URLs. It validates versions/context and owns readiness and cleanup.
- Same-window clients expose a connection-scoped cancellation signal, so ending a connection cancels pending actions and approvals without destroying the host integration.

### Changed

- Release workflow: until a stable version exists, prereleases publish to npm `latest`
  (trusted publishing cannot move a second tag). From 1.0, prereleases publish to `beta`.

## 0.1.0-beta.10

- `ui.navigate` with `routes` now publishes one flat object schema: `path` lists the
  allowed paths as an enum and `params` says which paths take parameters. The former
  root `anyOf` made models behind OpenAI-compatible gateways call it with `{}`. Each
  route's parameter schema is now checked in the handler; rejections are unchanged.

## 0.1.0-beta.9

- `ui.navigate` treats `params: null`, and `params: {}` on routes without parameters, as
  no parameters. Models often send these, and they used to fail with `INVALID_PAYLOAD`.
  Parameters with any content are still rejected.

## 0.1.0-beta.8

- Add `preview(args, context)` to action definitions. The host validates arguments
  and returns a bounded, plain-text `{ title, details }` preview before approval.
- Add `executeActionResult` and React `executeHostActionResult` with normalized
  `succeeded`, `rejected`, `cancelled` and `failed` outcomes. Existing throwing APIs remain.
- Protocol `2.1.0` adds optional `hasPreview` capabilities and separate read-only
  preview requests/results over MessagePort. Peers without previews retain generic
  approval descriptions; a preview request is never an action execution request.

## 0.1.0-beta.7

- Add `assistant-bridge/testing` with `connectTestAssistant(integration, { approve })`: a test
  assistant that runs host actions through the SDK executor and answers commands by contract.
- Document what is public API and how versions change ([API stability](docs/stability.md)).
- **Breaking (protocol):** `PROTOCOL_VERSION` is `2.0.0`, because command results changed.
  Peers with the same major are compatible (`isCompatibleProtocolVersion`); envelopes accept any
  compatible version instead of exactly one.
- The handshakes check versions. The assistant sends its version (`READY` for iframes,
  `onReady(handler, { protocolVersion })` otherwise; the React hooks do it), and the host refuses
  an incompatible or missing one with status `error` and a `PROTOCOL_MISMATCH` diagnostic. New
  error code `PROTOCOL_MISMATCH`.
- **Breaking (protocol):** host commands have typed results, checked on the host:
  `{ opened: true }`, `{ closed: true }`, `{ focused: true }`, `{ prefilled: true }` and
  `{ accepted: true }` for `submitPrompt` (was `{ acknowledged: true }`). `assistantCommands`
  and `ask` resolve with them; an answer in another shape rejects with `INVALID_PAYLOAD`. The
  schemas are `assistantCommandResultDataSchemas` in `/contracts`.
- **Breaking:** the command dispatcher (and `useAssistantIntegration`) ignores callback return
  values and answers with the contract result. Chats refuse a command by throwing.
- **Breaking:** `createHostAssistantCommands` and `createAssistantBridgeClient` are no longer
  exported; they took the internal bridge. Use `integration.assistantCommands` and
  `integration.assistantClient`.

## 0.1.0-beta.6

- Add `assistant-bridge/contracts`: schemas, names, error codes and `PROTOCOL_VERSION`, with Zod
  as the only dependency. It omits the deprecated demo schemas.
- `AssistantHost` accepts `router={{ page, navigate }}` for hosts that switch pages by state;
  `navigate` receives a catalog key.
- `askAbout` and `useAssistantHost().ask` accept `{ selection, metadata }`. The host's
  `contextRevision` and `selection` cannot be overridden. A selection alone still works.
- `defineAction` accepts `exposeErrorMessages`: a handler's ordinary `Error` reaches the
  assistant as `ACTION_NOT_AVAILABLE` with reason `ACTION_FAILED` and its message.
- Failed requests, actions and commands reject with an `Error` carrying `code`, `message` and
  `reason`, instead of a plain object. Code that checks `error instanceof Error` now sees the
  safe message, including public reasons.
- **Breaking (security):** iframe chats no longer trust the `hostOrigin` query parameter on
  their own. Pass `allowedOrigins` to `useAssistantIframeConnection` or
  `useAssistantIntegration({ iframe })`; the parameter is used only when listed. An explicit
  `hostOrigin` works as before. Before, any page could frame the chat and act as its host.
- The package declares `sideEffects: false`. A host that does not embed an iframe or a federation
  remote no longer bundles that code.
- **Breaking:** `HostIntegration` no longer exposes `bridge`, `contextManager` or
  `actionRegistry`, nor the `connectIframe` method (use `connectHostIframe(integration, options)`), and `attachAssistantCommandHandler` is no longer exported. Use `updatePage`,
  the new `setSelection(selection | null)`, `connectEmbeddedAssistant` and `AssistantHost`.
  `targetRegistry`, `assistantCommands` and `assistantClient` stay.
- **Breaking:** `AssistantHost` no longer takes `actionDeps`. The `actions` factory runs on every
  render and registered actions delegate to its latest definitions, so handlers and `available`
  always see current host state. Actions re-register only when their published shape changes
  (names, descriptions, schemas, approval). Capability JSON Schemas are cached per Zod schema.
  `useHostIntegration` keeps `actionDeps`.
- **Breaking:** removed the `assistant-bridge/ag-ui` entry (WebSocket/STOMP agent client, run
  controller, chat session, run errors, protocol schemas and the `schemas/` files) and the
  `reduceActionProgress` / `finalizeActionProgress` helpers it used. Talking to a backend belongs to
  the chat application; the SDK now covers only the host/assistant connection. The package no
  longer depends on `@ag-ui/client`, `@ag-ui/core`, `@stomp/stompjs` or `rxjs`. Chats run host
  tool calls with `createAssistantActionExecutor` or `useAssistantIntegration().executeHostAction`.
- **Breaking:** removed APIs that only demos or internals used:
  - Root exports of internal parts: `HostBridge`, `TypedEventBus`, `RequestResponseChannel`,
    `HostActionRegistry`, `HostContextManager`, `attachHostPort`, `createPortAssistantClient`,
    `createAssistantConnection`, `defaultActionReadiness`, `waitForHostContext`,
    `reduceActionProgress` and `finalizeActionProgress`. Use `createHostIntegration`,
    `AssistantHost`, `connectIframe` / `connectAssistantIframe` and `createChatSession`.
  - Demo schemas and actions: `catalogFilterPayloadSchema`, `recordsFilterPayloadSchema`,
    `recordsSortPayloadSchema`, `uiOpenDetailsPayloadSchema`, `openDetailsAction`, the `details`
    option of `createUiActions`, the `ui.openDetails` readiness rule and the `UI_OPEN_DETAILS`,
    `CATALOG_FILTER`, `RECORDS_FILTER` and `RECORDS_SORT` names. Define your own actions with
    `defineAction`.
  - `useHostPageContextFromCatalog` (use `AssistantHost`), `useAskAi` (use
    `useAssistantHost().ask`) and `AssistantBridgeClient.getInitialContext` (use `getContext`).
    Custom clients no longer implement `getInitialContext`.

## 0.1.0-beta.5

- `definePageCatalog` entries accept `path`, `match: 'prefix'`, `needs` and `params`. New
  catalog methods `allowed`, `destinationsFor` and `navigation` derive pages, destinations and
  `navigateAction` options for a principal. Existing catalogs behave as before.
- Add `AssistantHost` and `useAssistantHost` to `/react`: one component for the integration, page
  context, principal, destinations, `ui.navigate`, host actions, an optional same-window
  connection, `ask` and an optional highlight style.
- Add `usePageEntities` for entities of mounted page components.
- Add `queryNavigate` (router adapter; the base query cannot be overridden) and
  `pointOutTargets`.
- `useUiTarget` does nothing outside `IntegrationProvider`, sets `data-assistant-highlight`
  (`HIGHLIGHT_ATTRIBUTE`) while highlighted and accepts a custom `scrollIntoView`.
- `NavigateRoute.params` accepts optional schemas, so a page can open with or without parameters.

## 0.1.0-beta.4

- Require `@ag-ui/client` and `@ag-ui/core` `^1.0.4`, which take Zod as a peer dependency.
  Applications no longer need a `zod` override for GHSA-mrhx-c7xc-m3w5.
- Remove the package's own `zod` override.
- **Breaking:** `AssistantEmbed` federation configuration requires `loadAdapter`
  (`() => import('assistant-bridge/react/federation')`). `/react` no longer imports
  the federation adapter, so applications bundle it without `@module-federation/runtime`.
- `package:check` bundles `/react` with Vite in a consumer that has only React installed.
- Add `useOptionalIntegration()` to `/react`; it returns `null` outside `IntegrationProvider`.
- `updatePage` and `useHostPageContext` accept `destinations`, so destinations can follow
  permission or environment changes without remounting the integration. Omitted destinations
  are preserved.
- Add `AssistantBridgeClient.getContext()`. `getInitialContext()` is a deprecated alias.
  Custom `AssistantBridgeClient` implementations must add `getContext`.
- `onStatus` is optional in `connectEmbeddedAssistant` and the other connection options.
- Document `askAbout` for host suggested questions and the entity-structure conventions.
- `navigateAction` accepts `routes` with per-route parameter schemas. The assistant sends
  `{ path, params }`, the SDK validates `params`, and `navigate(path, params)` lets the host build
  the URL. `allowedRoutes` is now optional; without `routes` the payload schema is unchanged.
- Add an optional `HostContext.principal` (`id`, `label`, `permissions`) published through
  `updatePage`, `useHostPageContext` or `contextManager.setPrincipal`, and the `whenPermitted`
  availability helper. The principal is assistant-facing data, not authorization.

## 0.1.0-beta.3

- Add `useHostPageContextFromCatalog` to sync page context from a page catalog.
- Add action authoring helpers for empty payloads and page-type availability.
- Add `UI_TARGET_ACTIONS` to enable all built-in UI target tools.
- Add a `beforeNavigate` hook to `navigateAction` and `createUiActions`.
- Move the Zod override from `.npmrc` to `package.json`.
- **Breaking:** remove `appId` from `HostContext`, `createHostIntegration` / `useHostIntegration`, and the `host.ready` event payload. Host identity is no longer part of the integration contract.

## 0.1.0-beta.2

- Install `zod@^4.6.6` as a regular dependency instead of a required peer, so one
  command installs the package and versions affected by GHSA-mrhx-c7xc-m3w5 are excluded.
- Split the README into focused API documents with linked API trees.
- Add an optional `stompDestinations` override for STOMP backends using other paths.
- Document the Zod override applications need until `@ag-ui/client`, which still
  installs `zod@^3.25.76`, accepts a patched release.

## 0.1.0-beta.1

Initial standalone beta release of `assistant-bridge`.

- Framework-agnostic host integration, validated actions and context updates.
- Host-to-assistant commands and iframe communication.
- Optional React and Module Federation adapters.
- Optional AG-UI WebSocket/STOMP clients and headless chat coordination.
- TypeScript declarations and JSON protocol schemas.

This is a prerelease. The public API may change before the first stable release.
