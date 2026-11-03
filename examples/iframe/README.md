# Minimal iframe integration

Reference components for two separate React applications. These files do not include
a dev server or a backend. Use React 19.3+ and the SDK's React peer dependencies.

1. In your chat application's entry, render `ChatApp` from `ChatApp.tsx`.
   Keep `../Chat.tsx` next to the `iframe` folder when copying this example.
2. Serve that application, for example at `http://localhost:5174/`.
3. In your host application, render
   `<Host chatUrl="http://localhost:5174/" />` using `Host.tsx`.
4. When the connection shows `ready`, click **Ask about renewals**.
   The chat opens with a draft. Click **Send** inside the chat to get the demo reply.
5. Replace `sendMessage` in `ChatApp.tsx` with your existing backend call.

## Connection flow

```text
Host.tsx
  useHostIntegration → IntegrationProvider → AssistantIframe
                                              ↓ handshake / MessagePort
ChatApp.tsx → Chat.tsx → useAssistantIntegration
```

`AssistantIframe` adds `hostOrigin` and `embedded=1` to the chat URL and manages
the connection lifecycle. `useAssistantIntegration` reads the host origin and
connects from inside the iframe. Do not pass `bridge` or `onReady` across an iframe.

The host sends page context and commands through the SDK. The chat's `sendMessage`
still calls its own backend. This example allows no assistant-to-host actions
(`actions: []`). In a routed host, use `useHostPageContext` to keep page context current.

The chat deployment must permit embedding by the host in its `frame-ancestors`
policy and must not block it through `X-Frame-Options`.
