# Host-owned chat: implementation record

Status: implemented on `feature/host-owned-chat` (2026-11-18), pending review. No commit, publication or deployment. Package version remains the existing beta.10 until a release is requested. See [connections and migration](connections.md) for the public API.

## Accepted boundaries

- AC-1: The SDK does not load remote code, create frames, inspect parent windows or select an embedding mode. Federation dependencies and embedding entry points/components are removed.
- AC-2: Local components and independently built same-window chats use `EmbeddedAssistantOptions` (`bridge`, `onReady`). Loading/rendering/retry are host-owned; receiver readiness remains SDK-owned.
- AC-3: `useAssistantIntegration` uses an explicitly supplied client. Absent client means disconnected standalone mode. URL parameters do not establish a connection.
- AC-4: Disconnect cancels pending approvals/actions and prevents dispatch through stale clients, while allowing a new connection on the live host integration.
- AC-5: Optional `transports/message-port` communicates over caller-authenticated ports, validates context/versions and requires acknowledgement. It does not own iframe/window authentication or port transfer.
- AC-6: T-Compose and the POC retain their own UI and backend protocols and work with the shared connection contract.

## Implemented

The POC host now owns its federation loader, load timeout, render boundary and retry. T-Compose adds a host composition component and passes the client explicitly into its local panel/conversation hook. Both consumers retain exact published beta.10 pins; new SDK compatibility was checked through a temporarily installed packed artifact, not source aliases or committed local dependency overrides.

This supersedes the older audit proposal to keep federation loading/rendering inside the SDK. Same-window action/command protocol stays `2.1.0`. The new optional MessagePort bootstrap requires both endpoints to adopt it together; it is not interchangeable with the removed iframe bootstrap.

## Verification — 2026-11-18

- SDK `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`: passed.
- SDK `pnpm test`: 187 passed. After preserving asynchronous failure semantics for disposed client requests, focused connection/hook/port suites: 26 passed.
- `pnpm package:check`: passed. Packed files, exports and isolated core/contracts/testing, React and MessagePort imports were verified. React bundled without federation; package checks reject federation/frame/window-parent implementation references in shipped JavaScript/types.
- POC: lint/typecheck/format/build passed; 124 unit/server tests and 4 selected browser workflows passed. Typecheck and the same 4 browser workflows also passed against the new packed SDK.
- T-Compose: lint/typecheck/format/build passed; 209 unit tests and 5 assistant browser workflows passed. Typecheck and the same 5 browser workflows also passed against the new packed SDK, on isolated servers and a newly created dedicated `_e2e` database.

Initial sandboxed server tests could not open local ports; reruns with the required local-server access passed. The default package-manager launcher stalled, so checks used installed pnpm 9.15.1 with package-manager auto-download disabled. Project package-manager declarations were not changed. Consumer builds report the existing large-chunk warning. No live model-provider verification was required for this communication/loading refactor.
