# AG-UI client

The optional `assistant-bridge/ag-ui` entry connects an assistant to an agent backend. It is separate from the bridge connecting the assistant to the host. See the [wire contract](ag-ui-protocol.md) to implement a compatible backend.

<pre>
├─ Agent client
│  ├─ <a href="#agent-client">runWebSocketAgent, WebSocketAgent</a>
│  ├─ <a href="#host-tools-and-context">createHostAgentOptions</a>
│  ├─ <a href="#protected-tools-and-entities">requestConfirmation</a>
│  └─ <a href="#stomp-over-websocket">transport, stompDestinations</a>
├─ Headless chat
│  ├─ <a href="#chat-run-controller">createChatRunController</a>
│  └─ <a href="#chat-session">createChatSession</a>
└─ Errors
   └─ <a href="#run-errors">RUN_ERROR_CODES, createRunError, normalizeRunError, isRunErrorCode, describeRunError</a>
</pre>

## Agent client

The optional `assistant-bridge/ag-ui` entry exports `WebSocketAgent` (extends the official `@ag-ui/client` AbstractAgent), the `runWebSocketAgent` helper, `createHostAgentOptions` and official AG-UI types/schemas. It connects a chat to an agent BFF.

`createHostAgentOptions(bridge)` advertises the current non-confirmation host tools and page/selection context, and delegates approved tool calls back through `requestHostAction`. The client validates run/message/tool correlation, preserves text deltas exactly, forwards tool results and disposes the socket on completion, error, cancellation or timeout. The SDK root remains free of agent/provider imports.

See the [wire contract](ag-ui-protocol.md). Provider credentials and model selection belong only to the BFF.

Raw `WebSocketAgent` consumers can use `runAgent`, subscribers, `messages` and `state` directly; `runWebSocketAgent` creates a fresh instance per run. Host tool execution is performed by that helper, not automatically by a raw client. Safety limits, strict final tool-argument parsing, current permissions and error propagation remain application-owned. The direct RxJS version is pinned to the official client's version to share its Observable types. See [AbstractAgent](https://docs.ag-ui.com/sdk/js/client/abstract-agent).

## Host tools and context

Hosts can pass `destinations: [{ path: '/records', label: 'Records' }]` to `createHostIntegration` / `useHostIntegration`. Register readable target metadata with `useUiTarget('dashboard.kpi.revenue', { label: 'Revenue pipeline', description: 'Projected revenue' })`. The SDK publishes mounted target IDs, descriptions and supported interactions in `HostContext.targets`; DOM nodes and callbacks stay in the host. Capability publication respects each action's `available` predicate for the current context.

`createHostAgentOptions(bridge, { signal })` returns `tools`, `context`, `executeTool` and `getHostState`. Put `tools` and `context` in `input`, and pass `executeTool` and `getHostState` as callbacks to `runWebSocketAgent`. Successful navigation waits for the destination context with a bounded timeout; tool results carry fresh tools/context to the BFF for the next turn. The SDK rechecks current permissions on every execution and updates its run allowlist before returning the result. See the [wire contract](ag-ui-protocol.md).

`runWebSocketAgent` also accepts `onToolActivity({ id, name, status, args, error })`. Status is `running`, `succeeded` or `failed`, based on the actual host callback result. Chat UIs can retain an action timeline independently of generated prose. Arguments are provided for presentation mapping; store only what the UI needs, such as a derived label and outcome. Host error details are mapped to safe user messages. `onActivity` reports short text activity.

## Protected tools and entities

`createHostAgentOptions(bridge, { signal, requestConfirmation })` optionally exposes capabilities marked `requiresConfirmation`. The callback receives `{ name, description, args }` and returns `Promise<boolean>`. Without a callback, protected capabilities are excluded. The adapter snapshots arguments, checks cancellation and rechecks current route/capability after approval before dispatch. Rejection returns an `ACTION_REJECTED` tool error and a `rejected` activity outcome.

The trusted chat adapter forwards a separate `confirmed` flag through `requestHostAction`; the host action registry rejects protected calls without it. This is a UI consent contract between trusted clients, not authentication or a signed approval. Business HTTP endpoints and authorization remain application-owned. Stop/close/deadline must abort the signal and dismiss pending approval; already executed actions are not rolled back.

Business entities are separate from UI targets in `HostContext.entities`: each has a type, canonical ID, label, optional reference/aliases and string attributes. The host publishes route-relevant cached entities through `contextManager.setEntities`. Only host-selected summary fields cross the bridge; no full business objects are inferred from target IDs. The agent receives these summaries to resolve names to canonical IDs.

Protected action confirmation receives a copy of the current entity summaries. A chat can use those host-supplied labels and status values to show the item name and before/after status without technical tool descriptions or JSON for status changes and deletion. If the route, capabilities or entity summaries change while approval is pending, dispatch is rejected; a new action request is required. Entity metadata is context, not authorization, and host handlers remain authoritative.

Host handler errors may carry known protocol codes such as `RESOURCE_NOT_FOUND`, `SERVICE_UNAVAILABLE`, `INVALID_PAYLOAD` or `STALE_CONTEXT`. The registry preserves known codes through both embedding transports and falls back to `EXECUTION_FAILED` for unknown codes. The AG-UI adapter maps them to safe actionable messages rather than displaying arbitrary server details. A changed entity snapshot during approval returns `STALE_CONTEXT`.

## STOMP over WebSocket

Pass `transport: 'stomp'` to `runWebSocketAgent`/`WebSocketAgent` and use the backend STOMP URL. Omit transport or pass `'websocket'` for raw WebSocket. Event validation, tool handling, approval callbacks and cancellation stay shared. STOMP.js is dynamically loaded for a STOMP run; it is not exported through the SDK root. See the [wire contract](ag-ui-protocol.md). The default destinations are `/app/agent` and `/user/queue/agent`; override either with `stompDestinations: { controls, events }`. Another STOMP backend must otherwise implement the same binding.

See the [language-independent AG-UI transport contract and JSON fixtures](ag-ui-protocol.md) for implementing a compatible BFF. Shared control schemas/types are exported from `/ag-ui`; no server SDK is required.

## Chat run controller

`createChatRunController` lives only in `/ag-ui`, independently of React and message storage:

```ts
import { createChatRunController } from 'assistant-bridge/ag-ui';

const runs = createChatRunController({
  url: 'wss://agent.example.com/agent',
  // transport defaults to 'websocket'; set 'stomp' for the corresponding endpoint
});

const unsubscribe = runs.subscribe(() => {
  renderRunState(runs.getSnapshot());
});

const result = await runs.start({
  threadId: conversationId,
  messages: preparedHistory,
  bridge, // optional for standalone chat
  requestConfirmation, // optional SDK controller or custom UI callback
  onText: updateMessageText,
  onActionLifecycle: updateActionProgress,
});

// result.status is completed, stopped, or failed (with error).
// runs.stop() cancels an active run; a subsequent start gets a fresh runId.
// Permanent owner teardown:
unsubscribe();
runs.dispose();
```

One run may be active per controller. `start()` throws synchronously for overlapping calls or after disposal; otherwise its promise resolves with a typed final outcome. The controller generates `runId`, preserves caller-owned `threadId`, snapshots outgoing messages/state, prepares current host tools/context and confirmation callbacks, and owns the run AbortController. Optional caller and host-client lifetime signals are combined; an already-aborted signal does not open a connection. Configuration URL/transport/timeout is fixed for the controller lifetime; the bridge and callbacks are supplied fresh per start.

`getSnapshot()` has a stable frozen top-level snapshot until the state changes (`idle`, `running`, or the last final outcome). It is compatible with `useSyncExternalStore`. `stop()` is reusable and safe in React effect cleanup/Strict Mode replay; permanent `dispose()` is idempotent and refuses future starts. Disposing removes state observers and aborts current work. A chat UI can call stop on unmount, leaving the now-unobserved, inactive controller eligible for garbage collection.

Text/activity callbacks from an aborted or previous run are ignored. A pending current action may still report its `cancelled` lifecycle during final cleanup, preserving post-dispatch uncertainty; callbacks after finalization or after a newer run starts are ignored. Failure/terminal completion also aborts pending host work before returning. A cleanup abort does not reclassify a provider failure as a user stop. Cancellation cannot roll back a host mutation or force an arbitrary custom handler promise to terminate.

The consuming chat still owns input/focus, history persistence, history-to-AG-UI message mapping, message IDs/records, retry policy, labels and presentation of outcomes. The controller does not create a UI.

## Chat session

`createChatSession()` from `assistant-bridge/ag-ui` coordinates conversation messages,
streaming updates, stop, retry and action progress on top of `createChatRunController()`.
Supply a synchronous `ChatSessionStorage` adapter (`getActiveId`, `createConversation`,
`getMessages`, `append`, `update`) and optionally `describeAction` for application labels.
The adapter owns message storage, conversation selection, history limits and persistence.
The session does not import React or browser storage.

```ts
const session = createChatSession({ url: agentUrl, storage: conversationStorage });
await session.submit('Hello', { bridge, requestConfirmation });
session.stop();
// After a failed or stopped latest answer:
await session.submit('Hello', { retryId: answerId, bridge });
session.dispose();
```

Use `getSnapshot()` and `subscribe()` to observe run state. Submission captures its conversation,
so subsequent selection changes cannot redirect streaming updates. Retry reuses the latest failed
or stopped assistant message; only completed turns and the pending user prompt are sent to the agent.
`stop()` is reusable; `dispose()` permanently stops the session. Confirmation remains optional.
The lower-level run controller, AG-UI client and bridge remain independently usable. UI input, labels and history rendering
remain application responsibilities.

Chat session submissions may supply `context: [{ description, value }]` separately from the
visible prompt. It is merged with current host context in the AG-UI input, never appended to
user message text. The session stores it on the answer for retries; subsequent new questions do
not automatically inherit it. Storage adapters should preserve this optional message field if
retry must survive reload. Context remains model-visible and may be persisted by the consumer;
it is not a place for secrets.

## Run errors

The optional `/ag-ui` entry exports `RUN_ERROR_CODES`, `RunError`, `RunErrorCode`, `createRunError`, `normalizeRunError`, `isRunErrorCode` and `describeRunError`. These describe whole-run failures, separately from core host action/command errors.

`ChatRunResult` with `status: 'failed'` carries a safe `{ code, message }` rather than an arbitrary exception. Transport errors distinguish `CONNECTION_FAILED`, `CONNECTION_CLOSED`, `TIMEOUT`, `PROTOCOL_ERROR` and `RESPONSE_TOO_LARGE`. Server/provider codes include `INVALID_REQUEST`, `CONFIGURATION_ERROR`, `PROVIDER_AUTH_ERROR`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `AGENT_ERROR` and `STOPPED`.

```ts
if (result.status === 'failed') {
  showError(describeRunError(result.error));
  // Branch or translate by result.error.code, never by matching error.message.
}
```

Known codes select a fixed safe message. Raw server messages, stacks, URLs and provider bodies are not trusted, even when the code is known. Unknown codes and uncoded exceptions become `AGENT_ERROR`; their wording is not parsed to infer timeout or connection categories. Low-level `runWebSocketAgent` rejects typed errors for transport/protocol/server failures, while explicit caller abort still propagates its cancellation reason. The run controller uses its cancellation signal or typed server `STOPPED` to return `status: 'stopped'`, not a failed UI result. Cleanup abort does not turn a timeout/provider failure into a user stop.

STOMP setup (including the subscription receipt) has a typed 10-second timeout, independent of the overall run deadline. Local timeout/error cleanup closes transport resources. A BFF can retain provider-specific classification while reusing the SDK code/message catalog; backends in other languages can emit the documented code strings without importing TypeScript.
