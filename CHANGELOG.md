# Changelog

## 0.1.0-beta.2

- Install `zod@^4.6.6` as a regular dependency instead of a required peer, so one
  command installs the package and versions affected by GHSA-mrhx-c7xc-m3w5 are excluded.
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
