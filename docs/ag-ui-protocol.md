# Chat/BFF transport contract

This document describes the current application contract shared by the chat SDK and a BFF written in any language. A backend does not need to install this TypeScript SDK. It must implement the JSON messages and lifecycle below. The host SPA bridge is a separate protocol.

## Standard and application-specific parts

Server-to-client payloads are AG-UI events, validated using the installed `@ag-ui/core` event schemas. `RunAgentInput` and `ToolMessage` also come from AG-UI. This contract describes the subset used by this POC, not every AG-UI event or transport.

The client-to-server `run`, `stop`, `tool_result` envelopes, the optional `hostState` property and the WebSocket/STOMP binding are application-specific. They are not a standard AG-UI WebSocket protocol. `ToolMessage.error`, when supplied, carries our host-failure convention; other implementations must preserve it. There is currently no wire version negotiation. Breaking changes require coordinated deployment.

TypeScript implementations import `agentControlSchema`, `AgentControl` and `AGENT_STOMP_DESTINATIONS` from `assistant-bridge/ag-ui`. Client sends and BFF receives use the same envelope schema. Runtime limits and session state are enforced separately by the BFF.

## Client controls

| Type          | Required fields                         | Meaning                                                                                                                    |
| ------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `run`         | `input: RunAgentInput`                  | Start the connection's single run. Include `threadId`, `runId`, `messages`, `tools`, `context`, `state`, `forwardedProps`. |
| `stop`        | `runId: string`                         | Abort that active run. An unmatched ID is ignored.                                                                         |
| `tool_result` | `runId: string`, `message: ToolMessage` | Resolve a pending host tool using `message.toolCallId`.                                                                    |

A tool result can also contain `hostState: { tools, context }`. Tools contain `name`, `description`, and JSON Schema `parameters`; context items contain string `description` and string `value` (often serialized JSON). Refresh these after a host action so the next model step uses current capabilities and page state. This is not a general AG-UI state snapshot.

Successful tool results encode the host return value in the string `message.content`. Rejection or failure sets string `message.error` and supplies a safe explanatory `content`. Never forward secrets or raw internal error bodies. Approval happens in the host/chat boundary before host execution; the backend does not receive an approval token. This is not a server authorization mechanism.

## Lifecycle and ordering

1. Establish one connection per run; send one `run` after transport readiness.
2. Server emits `RUN_STARTED` with matching `threadId` and `runId`.
3. Text: `TEXT_MESSAGE_START` (new `messageId`, role `assistant`), one or more `TEXT_MESSAGE_CONTENT` deltas, then `TEXT_MESSAGE_END` with that ID. Concatenate deltas exactly; preserve whitespace and Markdown.
4. Host tool: `TOOL_CALL_START` (unique `toolCallId`, advertised `toolCallName`), `TOOL_CALL_ARGS` deltas containing JSON when concatenated, then `TOOL_CALL_END`. Register the pending call before emitting its end. Await the matching client `tool_result`; emit `TOOL_CALL_RESULT` with `messageId`, `toolCallId`, `content`, role `tool`. Only then continue dependent work. The example runner stops remaining actions after failure/rejection; that policy belongs to the runner.
5. Finish with `RUN_FINISHED` containing matching IDs, or terminal `RUN_ERROR` containing safe `code` and `message`. A rejected tool is a tool outcome, not necessarily a run error.
6. Client releases the connection after terminal event. Do not send subsequent events. Stop/disconnect aborts pending work; never replay mutations automatically.

A second `run` on the same connection, malformed control, wrong-run tool result, or unknown/already-resolved tool ID is invalid. Current BFF emits `RUN_ERROR` with `INVALID_REQUEST` then closes with WebSocket code 1008. A matching stop normally produces `STOPPED`, but the cancelling client closes immediately and need not observe that event. Unexpected disconnect before a terminal event is a client-visible failure. No resume or delivery guarantee is provided.

## Raw WebSocket binding

Default local endpoint: `ws://localhost:3001/agent`. Each text WebSocket message contains one JSON control (client) or one JSON AG-UI event (server). No outer event envelope, SSE framing, or `[DONE]` marker. WebSocket preserves message order; JSON text uses UTF-8. Deployment URL and allowed browser origins belong to the application.

## STOMP binding

Default local endpoint: `ws://localhost:3001/agent/stomp`. Negotiate STOMP 1.2 with `host` and `accept-version:1.2`; heartbeat `0,0`. Subscribe once to `/user/queue/agent`, with a nonempty subscription ID, `ack:auto` and receipt. Wait for `RECEIPT` before sending the run.

Send every control as a `SEND` body to `/app/agent` with `content-type:application/json`. Receive each AG-UI event as a `MESSAGE` body on the subscription. STOMP framing is not part of the JSON fixtures. Destinations are connection-local, not shared user queues. The POC server is a limited binding, not a general broker: no transactions, client acknowledgments, durable subscriptions, reconnect/replay or negotiated heartbeats. Other STOMP servers can implement this binding without using our Node parser.

## Limits and errors

Current BFF limits: at most 200 input messages, 32 tools, 10 context entries; refreshed host state also caps tools/context at 32/10. WebSocket maximum payload is 256,000 bytes. STOMP additionally limits incomplete-frame buffering to 256,000 bytes, total inbound bytes per connection to 4,000,000, and setup to 10 seconds. Run deadline defaults to 120 seconds and is configurable. Client limits tool-argument buffers to 32,000 characters and assembled assistant text to 200,000 characters. These are POC policies, not universal AG-UI limits.

`RUN_ERROR` codes currently include `INVALID_REQUEST`, `STOPPED`, `TIMEOUT`, `CONFIGURATION_ERROR`, `PROVIDER_AUTH_ERROR`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `AGENT_ERROR`. Invalid origin/path rejects the HTTP upgrade (403); invalid STOMP framing/destination emits STOMP `ERROR` and closes. A provider error must expose a safe message, never credentials or the raw provider response. Origin checks are not authentication; deployments own identity and authorization.

## Portable examples and verification

[Fixtures](fixtures/ag-ui/) are ordinary UTF-8 JSON files. Each has `scenario` and ordered `steps`; a step has `direction` (`client` or `server`) and `value` (the actual wire JSON). These wrapper fields belong only to the fixture format.

- [Text response](fixtures/ag-ui/text.json)
- [Host action succeeds](fixtures/ag-ui/tool-success.json)
- [Host action rejected](fixtures/ag-ui/tool-rejected.json)
- [Stop](fixtures/ag-ui/stop.json)
- [Timeout](fixtures/ag-ui/timeout.json)

For another language, substitute generated IDs while preserving their correlations; parse client values as controls and emit server values as AG-UI events. The fixtures show valid conversations, not an exhaustive conformance suite. The SDK tests validate every fixture payload against the shared/official schemas and check run/tool ordering. Existing BFF integration tests exercise actual raw/STOMP transport, cancellation, approvals and isolation without a live model.

## JSON Schema for Java and other backends

Download [agent-control.schema.json](../schemas/agent-control.schema.json) and [host-agent-state.schema.json](../schemas/host-agent-state.schema.json). Both use JSON Schema draft-07. They are also available through the package's `schemas/*` export. A Java BFF can validate parsed JSON using a draft-07-compatible validator, then map the accepted object into its own DTOs. It does not import TypeScript or run Node. Server events still follow AG-UI; these files describe our incoming controls and host-state extension, not all server events.

Generate with `pnpm build`; verify committed artifacts with `pnpm schemas:check`. The generator uses Zod's input representation, so transforms/defaults are not applied by JSON Schema validation. Unknown object fields are tolerated, matching Zod's input acceptance (Zod strips them afterward). Two AG-UI custom guards for metadata/activity content are represented as JSON objects. Runtime correlation, limits, authorization and cancellation remain server responsibilities; schema acceptance alone does not make a request executable.

### Client-side run error normalization

The SDK maps `RUN_ERROR.code` to a shared safe message and does not display the server's raw `message`. Unrecognized/missing codes use `AGENT_ERROR`. Backends should emit the server codes listed above; Java/Python implementations need no SDK dependency. Local transport validation additionally produces `CONNECTION_FAILED`, `CONNECTION_CLOSED`, `PROTOCOL_ERROR`, `RESPONSE_TOO_LARGE` and `TIMEOUT`. These are application error codes, not additional AG-UI event types. A typed server `STOPPED` is represented as a stopped run in the headless controller.
