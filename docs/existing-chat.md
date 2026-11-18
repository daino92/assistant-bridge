# Integrate an existing chat app

Use `useAssistantIntegration` from `assistant-bridge/react` to connect an existing React 19.3+ chat to a host. Keep the chat's UI, history, authentication, backend connection and message format.

The hook accepts the same `bridge` and `onReady` embedding props as the demo chat. Without a supplied bridge it stays disconnected. It requires no host `IntegrationProvider` inside the chat.

## Connect the chat's existing functions

```tsx
import type { EmbeddedAssistantOptions } from 'assistant-bridge';
import { useAssistantIntegration } from 'assistant-bridge/react';

interface ExistingChatAdapterProps extends Partial<EmbeddedAssistantOptions> {
  openChat: () => void;
  closeChat: () => void;
  focusInput: () => void;
  setDraft: (text: string) => void;
  sendMessage: (prompt: string, metadata?: Record<string, unknown>) => Promise<void>;
}

const ExistingChatAdapter = ({
  bridge,
  onReady,
  openChat,
  closeChat,
  focusInput,
  setDraft,
  sendMessage,
}: ExistingChatAdapterProps) => {
  const integration = useAssistantIntegration({
    bridge,
    onReady,
    commands: {
      onOpen: openChat,
      onClose: closeChat,
      onFocus: focusInput,
      onPrefill: setDraft,
      onSubmit: sendMessage,
    },
  });

  return (
    <>
      {integration.confirmation && (
        <section role="dialog" aria-label="Approve host action">
          <p>{integration.confirmation.description}</p>
          <button onClick={integration.approve}>Approve</button>
          <button onClick={integration.reject}>Reject</button>
        </section>
      )}
    </>
  );
};

export default ExistingChatAdapter;
```

Mount this adapter once alongside the existing chat UI. The callbacks must acknowledge actual work: `sendMessage` should reject if the backend is disconnected or the chat cannot accept another prompt. Its promise should resolve when the prompt is accepted; it does not have to wait for the complete model response. Omit unsupported callbacks; the host receives `UNKNOWN_COMMAND` instead of a false success.

The host owns the surrounding embedding panel. `onOpen` may also select the chat tab; `onClose` may stop the current reply. The chat adapter owns those local decisions.

## Connection modes and lifecycle

- **Local component/widget/remote:** the host loads and mounts the chat, passing `bridge` and `onReady` from `connectEmbeddedAssistant`. Loading strategy is an application concern.
- **Separate window:** application bootstrap authenticates the peer, transfers a private MessagePort and explicitly supplies the client from `connectAssistantPort`.
- **Standalone:** omit the connection. No window listeners, URL interpretation or iframe initialization occur.

`isConnected` describes the bridge, not backend availability. Use `integration.bridge?.getContext()` for a fresh outbound snapshot. Callback changes do not reconnect. Bridge replacement, connection disposal or unmount cancels pending hook-owned actions/approvals and detaches commands. The hook never disposes the host integration. See [connections and migration](connections.md).

## Adapt the existing backend protocol

The hook does not import AG-UI, create a socket, or translate backend frames. Each chat adapts its own protocol at these three points:

| Boundary               | Adapter responsibility                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outbound prompt        | Include an agreed, allowlisted host context snapshot and action descriptions/parameter schemas when supported by the backend. Preserve existing auth, session and channel fields. |
| Inbound action request | Translate a typed backend action into an explicitly allowed SDK action name and validated payload. Await `integration.executeHostAction(name, payload, { toolCallId })`.          |
| Outbound action result | Send success or a normalized error through the existing backend protocol, correlated to the original call. Refresh the host context and capabilities after execution.             |

Backend support is required for dynamic tool discovery and correlated results. STOMP and raw WebSocket are transports; neither makes an existing payload format AG-UI-compatible. Do not point `createChatSession` at an incompatible endpoint.

`executeHostAction` uses the existing SDK executor: host capabilities, payload validation at the host, context revision checks, confirmation, action lifecycle events and readiness handling remain in effect. Render `confirmation` with `approve`/`reject`, or supply an existing approval UI through `actions.requestConfirmation(request, signal)`. A custom approval callback must respect cancellation. `actions` also accepts `signal`, `readiness`, `contextWait` and `onActionLifecycle`; updates apply to new action executions without aborting an existing action on every React render.

The SDK contains no backend client. An AG-UI, SSE or other backend adapter lives in the chat application and calls `executeHostAction` (or `createAssistantActionExecutor` with `integration.bridge` and `integration.requestConfirmation`) for each host tool call.

## Candidate mappings

These are integration points identified in the frontend repositories, not completed migrations or verified backend contracts.

| Concern         | Commercebot                                                                                      | Tell-a-story                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Host connection | Extend `WisemanChatWidget.render` options with `bridge`/`onReady`; preserve Shadow DOM mounting. | Use explicit application bootstrap and the optional SDK MessagePort adapter.                                             |
| Commands        | Wire panel state, draft, focus and the existing send flow.                                       | Select the chat tab, update draft/focus and call the existing `handleSend` flow.                                         |
| Backend         | Keep `useWebSocket`, streaming, auth and deterministic cards. Add agreed context/action frames.  | Keep `useStomp`, session topics, tokens, widgets and flow progress. Extend the agreed message metadata/result contract.  |
| Host actions    | Introduce typed action requests through `executeHostAction`.                                     | Translate allowlisted `nextAction` values and applicable quick-action `post_message` entries into SDK actions.           |
| Legacy behavior | Keep unrelated teaser/language behavior local.                                                   | Keep local `open_url`, form and flow behavior local; define explicit contracts for host resize/toggle/basket operations. |

When SDK mode is enabled, route a given host operation through the SDK once. Do not also emit the legacy CustomEvent or `postMessage` for that operation. Unknown legacy actions must fail explicitly rather than dispatch arbitrary payloads. The embedding host defines allowed actions and business rules; the chat does not grant itself capabilities.

Both candidates require the supported React version for `/react`. Backend changes and host configuration are separate from installing the frontend SDK. No backend credentials belong in browser options.

### Optional simplifications

Use `integration.executeHostActionResult(name, payload, { toolCallId })` to avoid
repeating exception-to-result mapping. It returns `succeeded` with `data`, or
`rejected`, `cancelled` or `failed` with a normalized `error`. Your adapter still
owns backend tool-result IDs, its wire format and when to stop a cancelled run.
The throwing `executeHostAction` API remains supported.

If the host defines `preview` on an action, render
`integration.confirmation.preview.title` and `.details` in your existing approval
UI. With no preview, use `.description`. This removes an action-name-to-preview
mapping from the chat. The preview is validated host data, not model-generated
instructions or permission to execute a write.
