# React chat quick start

The chat side of an integration. The chat keeps its UI, messages, history and backend; the SDK connects it to a host so that it can:

- read the host context (page, entities, allowed actions);
- run host actions, with validation and user approval;
- answer host commands (`open`, `close`, `focus`, `prefill`, `submitPrompt`).

For the host side, see the [host quick start](quick-start.md). For a chat that already exists, with its own backend protocol, see [integrate an existing chat](existing-chat.md).

## 1. Install

```bash
pnpm add assistant-bridge@beta
```

`/react` requires `react@^19.3.0`.

## 2. Accept the connection

A chat embedded in the same window or through Module Federation receives two props from the host: `bridge` and `onReady`. Their type is `EmbeddedAssistantOptions`.

```tsx
import type { EmbeddedAssistantOptions } from 'assistant-bridge';

// The module a federation host loads, or the component a same-window host renders.
const EmbeddedChat = ({ bridge, onReady }: EmbeddedAssistantOptions) => (
  <Chat bridge={bridge} onReady={onReady} />
);

export default EmbeddedChat;
```

A chat loaded in an iframe receives neither prop. The SDK connects through the iframe handshake instead (see [step 6](#6-iframe-chats)).

## 3. Connect

```tsx
import type { EmbeddedAssistantOptions } from 'assistant-bridge';
import { useAssistantIntegration } from 'assistant-bridge/react';

const Chat = ({ bridge, onReady }: Partial<EmbeddedAssistantOptions>) => {
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);

  const integration = useAssistantIntegration({
    bridge,
    onReady,
    commands: {
      onOpen: () => openChat(),
      onClose: () => closeChat(),
      onFocus: () => input.current?.focus(),
      onPrefill: (text) => setDraft(text),
      onSubmit: (prompt) => send(prompt),
    },
  });

  // integration.context: the latest host context, or undefined when not connected.
  // integration.isConnected: whether a host is connected.
  // …
};
```

- The hook announces the chat to the host only after the command handler is registered.
- Omit a callback the chat does not support; the host then gets `UNKNOWN_COMMAND` instead of a false success.
- `onSubmit` should reject when the chat cannot accept a prompt (for example while answering). It resolves when the prompt is accepted, not when the answer is complete.
- On unmount or disconnect the hook detaches commands and cancels pending actions and approvals.

## 4. Send the host context to your backend

```ts
const send = async (prompt: string) => {
  const host = integration.bridge?.getContext(); // fresh snapshot, or undefined

  await backend.ask({
    prompt,
    page: host?.page,
    entities: host?.entities,
    actions: host?.capabilities, // name, description, JSON Schema, requiresConfirmation
  });
};
```

Send only what your backend needs. `capabilities` lists the actions the host allows right now; the model should request only those.

## 5. Run host actions

When your backend asks for a host action:

```ts
import { ERROR_CODES } from 'assistant-bridge';

try {
  const data = await integration.executeHostAction(name, args, { toolCallId });

  await backend.sendToolResult(toolCallId, { ok: true, data });
} catch (error) {
  const code = (error as { code?: string }).code;

  await backend.sendToolResult(toolCallId, {
    ok: false,
    rejected: code === ERROR_CODES.ACTION_REJECTED,
    message: error instanceof Error ? error.message : 'The action failed',
  });
}
```

`executeHostAction` checks that the action is currently allowed, waits for a stable host context and, when the action requires it, asks the user. The host validates the payload again and runs its handler. Error messages are safe to show: the SDK never forwards raw handler errors.

Render the approval request when one is pending:

```tsx
{
  integration.confirmation && (
    <section role="dialog" aria-label="Approve action">
      <p>{integration.confirmation.description}</p>
      <button onClick={integration.approve}>Approve</button>
      <button onClick={integration.reject}>Reject</button>
    </section>
  );
}
```

To use your own approval UI, pass `actions: { requestConfirmation: (request, signal) => … }` to the hook; it must resolve to `true` or `false` and respect `signal`.

## 6. Iframe chats

Without `bridge`, the hook can connect to a parent window through the iframe handshake. The host's `AssistantEmbed` (iframe mode) adds `embedded=1` and `hostOrigin` to the chat URL. List the host origins the chat trusts:

```ts
useAssistantIntegration({
  commands,
  iframe: { allowedOrigins: ['https://app.example.com'] },
});
```

The chat connects only when the `hostOrigin` in its URL is in that list, and then accepts messages only from that exact origin and the parent window. Without `allowedOrigins` (or an explicit `iframe.hostOrigin`) it does not connect: otherwise any page could frame the chat and act as its host. Set `iframe: { enabled: false }` for a standalone chat.

## Backend protocols

The SDK does not talk to your backend. Whatever the protocol (AG-UI, SSE, WebSocket), the chat sends the host context and capabilities in its own format (step 4) and runs each requested host action with `executeHostAction` (step 5).

## Responsibilities

| Chat supplies                       | SDK handles                                      |
| ----------------------------------- | ------------------------------------------------ |
| UI, messages, history and storage   | Host connection and command routing              |
| Backend protocol and authentication | Host context snapshots                           |
| Approval UI                         | Action availability, approval flow and lifecycle |
| Which host origins it trusts        | Origin-checked iframe handshake                  |
