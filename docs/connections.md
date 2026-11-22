# Explicit connections and host-owned loading

The host owns how the chat is delivered and mounted. The SDK owns communication: context, capabilities, validated actions, commands, protocol compatibility, readiness and disposal. A local component and an independently deployed remote use the same `EmbeddedAssistantOptions` (`bridge`, `onReady`). A second application does not require a second window.

## Same-window connections

Load the chat using the host's local import, dynamic import, Module Federation runtime or widget loader. Then create its connection:

```ts
import { connectEmbeddedAssistant } from 'assistant-bridge';

const connection = connectEmbeddedAssistant(integration, { onStatus });
const props = { bridge: connection.bridge, onReady: connection.onReady };
// The host mounts its already loaded Chat with props.
// On unmount/retry: connection.dispose().
// On a render failure: connection.fail(); show the host's error UI.
```

`onStatus` describes the command receiver (`loading`, `ready`, `error`), not module downloading or backend availability. Create the connection after a remote load succeeds. Its default 10-second timeout then bounds receiver registration only. Ignore late remote results after load timeout, replacement or unmount. A retry must dispose the old connection, discard its render boundary and create a new one.

React hosts with an already available component can use `AssistantHost connection="embedded"` and pass `useAssistantHost().embedded` to the chat. This connection starts with the host effect, so a host that downloads a remote later should manage `connectEmbeddedAssistant` explicitly after loading it.

Chat code uses `useAssistantIntegration({ bridge, onReady, commands })` from `assistant-bridge/chat/react` or lower-level client APIs. It must not need the host's provider, internal services or federation runtime. Commands unsupported by the chat return `UNKNOWN_COMMAND`. Connection disposal aborts the supplied client's signal; hook-owned approvals and executions are cancelled. The integration remains reusable for a replacement connection.

## MessagePort connections

An application that needs a separate window owns frame creation, URLs, sandbox/framing policy and a secure port-transfer handshake. Before accepting or transferring a port, authenticate the peer using an exact trusted origin and expected window source. Do not trust an origin supplied in a URL or use wildcard targets. Recreate the channel after navigation/reload. These responsibilities stay in application integration code.

Once both sides have their authenticated ports:

```ts
// Host application bootstrap
import { connectHostPort } from 'assistant-bridge/transports/message-port';

const connection = connectHostPort(integration, {
  port: hostPort,
  onStatus,
});
// On frame removal/replacement: connection.dispose().
```

```ts
// Chat application bootstrap
import { createAssistantCommandDispatcher } from 'assistant-bridge/chat';
import { connectAssistantPort } from 'assistant-bridge/transports/message-port';

const connection = connectAssistantPort({
  port: chatPort,
  onCommand: createAssistantCommandDispatcher(commands),
  onClient: (bridge) => setChatBridge(bridge),
});
// Supply bridge explicitly to useAssistantIntegration({ bridge, commands }).
// onCommand above routes host commands; no same-window onReady is needed.
// On application teardown: connection.dispose().
```

`hostPort`, `chatPort`, `commands` and `setChatBridge` are supplied by the applications. The SDK does not create or transfer these ports. The adapter owns version/context initialization and waits for chat acknowledgement before marking the host ready. Missing readiness times out; malformed context or incompatible versions never establish a client. Dispose either endpoint to disconnect and close the channel. Both endpoints must use this port initialization protocol; older iframe bootstrap messages are not interchangeable with it.

## Migration from the embedding adapters

| Removed API                                                                   | Replacement                                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `/federation`, `/react/federation`                                            | Host-owned remote loader plus `connectEmbeddedAssistant`             |
| `AssistantEmbed`, `FederatedAssistant`                                        | Host composition, load state and render error boundary               |
| `AssistantIframe`, `createAssistantIframeUrl`                                 | Host-owned iframe and URL                                            |
| `connectHostIframe`, `connectAssistantIframe`, `useAssistantIframeConnection` | Application-authenticated channel plus optional MessagePort adapters |
| `ASSISTANT_IFRAME_MESSAGES`                                                   | Application-owned window handshake                                   |
| `useAssistantIntegration({ iframe })`                                         | Explicit `bridge` / `onReady`; absent bridge means standalone        |

Module Federation remains a valid host loading choice. Remove its SDK peer dependency; keep it in hosts that use it. Same-window action/command envelopes remain protocol `2.1.0`; the new optional port bootstrap requires both endpoints to adopt it together. This is an unreleased package API change, not an instruction to publish or deploy.
