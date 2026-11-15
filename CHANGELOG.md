# Changelog

## Unreleased

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
