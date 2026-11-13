# Changelog

## Unreleased

- Require `@ag-ui/client` and `@ag-ui/core` `^1.0.4`, which take Zod as a peer dependency.
  Applications no longer need a `zod` override for GHSA-mrhx-c7xc-m3w5.
- Remove the package's own `zod` override.
- **Breaking:** `AssistantEmbed` federation configuration requires `loadAdapter`
  (`() => import('assistant-bridge/react/federation')`). `/react` no longer imports
  the federation adapter, so applications bundle it without `@module-federation/runtime`.
- `package:check` bundles `/react` with Vite in a consumer that has only React installed.

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
