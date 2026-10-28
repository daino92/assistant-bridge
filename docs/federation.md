# @assistant/host-sdk/federation

Optional, framework-agnostic Module Federation entry point from the single `@assistant/host-sdk` package. Consumers supply its optional `@module-federation/runtime` peer dependency. This entry point has no React dependency.

```ts
import { connectFederatedAssistant } from '@assistant/host-sdk/federation';

const connection = connectFederatedAssistant(integration, {
  runtimeName: 'my-host',
  remoteName: 'my-chat',
  exposedModule: 'EmbeddedAssistant',
  entry: 'https://chat.example/remoteEntry.js',
  attempt: 0,
  onStatus,
});
const Remote = await connection.load;
```

The host must initialize its federation runtime and configure shared dependencies through its build plugin. The loader registers the remote and resolves its default export. It does not render it. Supply `connection.bridge` and `connection.onReady` to the agreed component/mount contract. Render errors should call `connection.fail()`; unmount must call `connection.dispose()`.

The 10-second default `timeoutMs` includes loading and receiver registration. `load` resolves to `undefined` on errors, timeout or disposal; late loads cannot reactivate the connection. Status is `loading`, `ready` or `error`. A retry creates a new connection with an increased `attempt`, forcing registration with a cache-busted entry. The current application exports a React component, although this loader accepts any default export type.

For React consumers, `FederatedAssistant` from `@assistant/host-sdk/react/federation` wraps this loader with rendering, command wiring and an error boundary. See [the React component example](react.md#ready-made-federated-react-component). The generic loader remains available for other renderers and frameworks. An entry URL change replaces an already registered remote; retry attempts also force registration with a cache-busted entry.
