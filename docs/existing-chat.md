# Integrate an existing chat app

Use `useAssistantIntegration` from `assistant-bridge/react` to connect an existing React 19.3+ chat to a host. Keep the chat's UI, history, authentication, backend connection and message format. In this workspace the package is named `@assistant/host-sdk`; the standalone distribution is `assistant-bridge`.

The hook accepts the same `bridge` and `onReady` embedding props as the demo chat. Without a supplied bridge it can establish the SDK iframe connection. It requires no host `IntegrationProvider` inside the chat.

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

- **Direct/widget/federation:** pass `bridge` and `onReady` from `connectEmbeddedAssistant` or the federation adapter. Extend an existing widget's mount options to carry these two properties.
- **Iframe:** omit those properties. The hook uses `iframe.hostOrigin`, or the SDK `hostOrigin` query parameter. The parent must use the SDK host iframe connection. Existing `READY` messages alone do not implement this handshake.
- **Standalone:** without embedding props or an iframe parent/origin, `isConnected` is false. Set `iframe: { enabled: false }` to explicitly disable iframe initialization. The chat can continue using its own backend.

A supplied bridge takes precedence over iframe initialization. `isConnected` describes the host bridge, not the backend socket or model provider. Context is available as `integration.context`; use `integration.bridge?.getContext()` when taking a fresh snapshot for an outbound backend request. Host disconnect clears the exposed bridge/context and cancels approvals. Callback changes do not reconnect the host. Bridge replacement or unmount cancels pending hook-owned action execution and detaches commands; the hook never disposes a host-owned integration instance.

The iframe connection retains exact parent origin/source checks and a private MessagePort. No application-specific window events or wildcard `postMessage` are needed for SDK actions.

## Adapt the existing backend protocol

The hook does not import AG-UI, create a socket, or translate backend frames. Each chat adapts its own protocol at these three points:

| Boundary               | Adapter responsibility                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outbound prompt        | Include an agreed, allowlisted host context snapshot and action descriptions/parameter schemas when supported by the backend. Preserve existing auth, session and channel fields. |
| Inbound action request | Translate a typed backend action into an explicitly allowed SDK action name and validated payload. Await `integration.executeHostAction(name, payload, { toolCallId })`.          |
| Outbound action result | Send success or a normalized error through the existing backend protocol, correlated to the original call. Refresh the host context and capabilities after execution.             |

Backend support is required for dynamic tool discovery and correlated results. STOMP and raw WebSocket are transports; neither makes an existing payload format AG-UI-compatible. Do not point `createChatSession` at an incompatible endpoint.

`executeHostAction` uses the existing SDK executor: host capabilities, payload validation at the host, context revision checks, confirmation, action lifecycle events and readiness handling remain in effect. Render `confirmation` with `approve`/`reject`, or supply an existing approval UI through `actions.requestConfirmation(request, signal)`. A custom approval callback must respect cancellation. `actions` also accepts `signal`, `readiness`, `contextWait` and `onActionLifecycle`; updates apply to new action executions without aborting an existing action on every React render.

For an existing AG-UI chat, continue using `createChatSession` with `integration.bridge` and `integration.requestConfirmation`. The AG-UI adapter already translates capabilities, tools and results. It shares the same approval UI; do not execute a tool a second time through the manual adapter.

## Candidate mappings

These are integration points identified in the frontend repositories, not completed migrations or verified backend contracts.

| Concern         | Commercebot                                                                                      | Tell-a-story                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Host connection | Extend `WisemanChatWidget.render` options with `bridge`/`onReady`; preserve Shadow DOM mounting. | Add SDK assistant iframe initialization; parent uses SDK iframe embedding.                                               |
| Commands        | Wire panel state, draft, focus and the existing send flow.                                       | Select the chat tab, update draft/focus and call the existing `handleSend` flow.                                         |
| Backend         | Keep `useWebSocket`, streaming, auth and deterministic cards. Add agreed context/action frames.  | Keep `useStomp`, session topics, tokens, widgets and flow progress. Extend the agreed message metadata/result contract.  |
| Host actions    | Introduce typed action requests through `executeHostAction`.                                     | Translate allowlisted `nextAction` values and applicable quick-action `post_message` entries into SDK actions.           |
| Legacy behavior | Keep unrelated teaser/language behavior local.                                                   | Keep local `open_url`, form and flow behavior local; define explicit contracts for host resize/toggle/basket operations. |

When SDK mode is enabled, route a given host operation through the SDK once. Do not also emit the legacy CustomEvent or `postMessage` for that operation. Unknown legacy actions must fail explicitly rather than dispatch arbitrary payloads. The embedding host defines allowed actions and business rules; the chat does not grant itself capabilities.

Both candidates require the supported React version for `/react`. Backend changes and host configuration are separate from installing the frontend SDK. No backend credentials belong in browser options.
