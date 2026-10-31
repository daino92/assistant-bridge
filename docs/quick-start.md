# React host quick start

A minimal host integration using the current SDK API. This example uses React Router and an existing assistant application. It does not implement the chat itself.

## 1. Dependencies

The initial release is `0.1.0-beta.1`. After it is published, install the beta
and its required peer dependency:

```bash
pnpm add assistant-bridge@beta 'zod@^4.6.0'
```

Before publication, run `pnpm install` and `pnpm pack` in the SDK repository,
then install the generated archive instead:

```bash
pnpm add /path/to/daino92-assistant-bridge-0.1.0-beta.1.tgz 'zod@^4.6.0'
```

React adapters require `react@^19.3.0`. Federation adapters additionally require
`@module-federation/runtime@2.9.2`.

The host also supplies React and React DOM. This example uses React Router.
See [standalone development](../README.md#standalone-development).

## 2. Create the provider and declare allowed actions

`HostIntegrationProvider.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';
import { createUiActions } from 'assistant-bridge';
import { IntegrationProvider, useHostIntegration } from 'assistant-bridge/react';
import { useLocation, useNavigate } from 'react-router-dom';

interface HostIntegrationProviderProps {
  children: ReactNode;
}

const HostIntegrationProvider = ({ children }: HostIntegrationProviderProps) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const integration = useHostIntegration({
    appId: 'my-host',
    actions: ({ targets }) =>
      createUiActions({
        navigation: { navigate, allowedRoutes: ['/', '/catalog'] },
        targets: { registry: targets, enable: ['highlight', 'focus'] },
      }),
  });

  useEffect(() => {
    integration.updatePage({
      route: pathname,
      page: {
        title: pathname === '/catalog' ? 'Catalog' : 'Dashboard',
        type: pathname === '/catalog' ? 'catalog-list' : 'dashboard',
      },
      selection: 'clear',
    });
  }, [integration, pathname]);

  return <IntegrationProvider integration={integration}>{children}</IntegrationProvider>;
};

export default HostIntegrationProvider;
```

Only the declared actions are enabled. Add business actions with `defineAction()` alongside `...createUiActions(...)`. Add `details: { open: openDetails }` when the host supplies detail navigation. Keep factories pure: return definitions without executing application behavior.

`useHostIntegration` owns instance lifetime and cleanup. Do not destroy it manually. The host publishes page changes and decides whether to clear or preserve selection; the SDK does not watch the router.

## 3. Register a UI target and publish selection

`CatalogPage.tsx`:

```tsx
import { useCallback } from 'react';
import { useIntegration, useUiTarget } from 'assistant-bridge/react';

const CatalogPage = () => {
  const { bridge } = useIntegration();
  const { ref, highlighted } = useUiTarget<HTMLInputElement>('catalog-search');

  const selectItem = useCallback(() => {
    bridge.publishEntitySelected('catalog', 'product-001');
  }, [bridge]);

  return (
    <main>
      <h1>Catalog</h1>
      <input
        ref={ref}
        aria-label="Search catalog"
        style={{ outline: highlighted ? '2px solid #2563EB' : undefined }}
      />
      <button onClick={selectItem}>Select product 001</button>
    </main>
  );
};

export default CatalogPage;
```

The assistant can request `ui.focus` or `ui.highlight` with `{ targetId: 'catalog-search' }` while this target is mounted. IDs and highlight styling belong to the host. The hook unregisters the target on unmount. Selection updates are delivered to the assistant as context; they do not submit a prompt.

## 4. Render the iframe assistant

`AssistantPanel.tsx`:

```tsx
import { AssistantEmbed, useAssistantPanel } from 'assistant-bridge/react';

const AssistantPanel = () => {
  const { open, openPanel, closePanel, status, onStatus, attempt, reconnect } = useAssistantPanel();

  return (
    <>
      <button onClick={openPanel}>Open assistant</button>
      <section hidden={!open} aria-label="Assistant panel">
        <button onClick={closePanel}>Close assistant</button>
        <p role="status">{status}</p>
        <AssistantEmbed
          config={{
            mode: 'iframe',
            iframe: {
              url: 'http://localhost:5174/',
              title: 'Assistant',
              style: { width: '100%', height: 600, border: 0 },
            },
          }}
          onStatus={onStatus}
          attempt={attempt}
        />
        {status === 'error' && <button onClick={reconnect}>Reconnect</button>}
      </section>
    </>
  );
};

export default AssistantPanel;
```

The assistant stays mounted when the panel is hidden, so it can receive commands. `useAssistantPanel` handles visibility commands and retry state; the component handles the iframe handshake and connection cleanup. The host supplies its own layout and loading/error UI. Replace the local URL with your deployed chat URL for production.

## 5. Compose the host

`App.tsx` (assuming these files are exported through the host's folder barrels):

```tsx
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';

import { HostIntegrationProvider } from '@/app/providers';
import { AssistantPanel } from '@/components';
import { CatalogPage } from '@/features';

const App = () => {
  return (
    <BrowserRouter>
      <HostIntegrationProvider>
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/catalog">Catalog</Link>
        </nav>
        <Routes>
          <Route path="/" element={<h1>Dashboard</h1>} />
          <Route path="/catalog" element={<CatalogPage />} />
        </Routes>
        <AssistantPanel />
      </HostIntegrationProvider>
    </BrowserRouter>
  );
};

export default App;
```

Mount `App` using the host's normal React entry point. The provider must be inside the router and above both target components and the assistant.

## Alternative: Module Federation

Keep the provider, routes, targets, panel hook and component import. Change only the `AssistantEmbed` configuration:

```tsx
// Inside the same panel, using attempt and onStatus from useAssistantPanel():
<AssistantEmbed
  config={{
    mode: 'federation',
    federation: {
      runtimeName: 'host_app',
      remoteName: 'assistant_chat',
      exposedModule: 'EmbeddedAssistant',
      entry: 'http://localhost:5174/remoteEntry.js',
    },
  }}
  attempt={attempt}
  onStatus={onStatus}
/>
```

The host must also supply `@module-federation/runtime` and initialize federation through its build plugin with compatible shared React dependencies. The `runtimeName` must match the host plugin name; the remote name/exposure must match the chat build. This repository already configures both: see host Vite config (`../../../vite.config.ts` in the original integration workspace) and chat integration/build configuration (`../../../apps/assistant-chat/INTEGRATION.md` in the original integration workspace). Replace local entry URLs for deployment.

`AssistantEmbed` downloads the federation adapter only when that mode is selected. Bundlers still resolve its dynamic import at build time, so the federation peer must be available when building this unified entry. The federation adapter expects a default React component accepting `EmbeddedAssistantOptions`; it supplies the restricted bridge client and command readiness callback. The remote must implement that contract. This is the contract used by this workspace's chat. See [unified embedding](react.md#unified-assistant-embedding) for retry and timeout behavior.

## Responsibility cheat sheet

| Host supplies                                         | SDK handles                                          |
| ----------------------------------------------------- | ---------------------------------------------------- |
| Allowed actions, routes and business callbacks        | Payload validation, dispatch and request correlation |
| Current page and selection policy                     | Context publication and capability synchronization   |
| Target IDs, DOM elements and styles                   | Target registration and action dispatch to targets   |
| Chat URL or federation configuration                  | Connection readiness, timeouts and cleanup           |
| Panel layout, loading/error messages and retry button | Visibility command subscriptions and retry state     |
| A compatible assistant application                    | Host/assistant communication contracts               |

For host-to-assistant commands such as `askAbout()` and `prefillAndOpen()`, see the [SDK guide](../README.md#high-level-integration-apis). For lifecycle details and assistant-side hooks, see the [React reference](react.md).
