# React host quick start

A minimal React host with `AssistantHost`. It uses React Router and an existing assistant application; it does not implement the chat. For the chat side, see the [chat quick start](chat-quick-start.md).

A host needs four things:

1. A page catalog.
2. `AssistantHost` around the app.
3. The actions the assistant may request.
4. The chat, embedded.

Everything else (bridge, context store, action registry, request correlation, timeouts and cleanup) stays inside the SDK.

## 1. Install

```bash
pnpm add assistant-bridge@beta
```

`/react` requires `react@^19.3.0`. Add `zod` to your own dependencies only when your code defines action schemas.

## 2. Describe the pages

`pages.ts`:

```ts
import { definePageCatalog } from 'assistant-bridge';

export const pages = definePageCatalog({
  dashboard: { title: 'Dashboard', type: 'dashboard', path: '/' },
  catalog: { title: 'Catalog', type: 'catalog-list' },
});
```

Each page gets the path `/<key>` unless it sets `path`. The catalog gives the assistant the page titles, the places it can open and the `ui.navigate` action. See [page catalog](core.md#define-page-catalog) for permissions (`needs`), query parameters (`params`) and sub-routes (`match: 'prefix'`).

## 3. Wrap the app

`AssistantProvider.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AssistantHost } from 'assistant-bridge/react';

import { createActions } from './actions';
import { pages } from './pages';

const AssistantProvider = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <AssistantHost
      pages={pages}
      router={{ pathname, navigate: (path) => navigate(path) }}
      actions={createActions}
      highlight
    >
      {children}
    </AssistantHost>
  );
};

export default AssistantProvider;
```

`pages` and `router` are the only required props. `AssistantHost` publishes the current page whenever `pathname` changes, registers `ui.navigate` and your actions, and disposes everything on unmount. Inline callbacks are fine: the latest `navigate` and `actions` are always used.

Optional props you will likely need later:

| Prop                    | Use it for                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `principal`             | The user's permissions, to hide pages and actions they cannot use. Not authorization.       |
| `entities`              | Data shared by every page, such as the current workspace.                                   |
| `beforeNavigate`        | Business rules before the assistant opens a page; throw `createIntegrationError` to refuse. |
| `actionDeps`            | A memoized value your actions depend on; they re-register when it changes.                  |
| `connection="embedded"` | A chat rendered in the same React tree. See [step 6](#6-embed-the-chat).                    |
| `highlight`             | A default outline for highlighted targets.                                                  |

The full list is in the [React reference](react.md#assistanthost).

## 4. Declare the actions

`actions.ts`:

```ts
import { z } from 'zod';
import { defineAction, type HostActionInput } from 'assistant-bridge';
import type { AssistantHostApi } from 'assistant-bridge/react';

export const createActions = ({ navigate }: AssistantHostApi): HostActionInput[] => [
  defineAction({
    name: 'catalog.search',
    description: 'Open the catalog filtered by a search term.',
    schema: z.object({ term: z.string().min(1).max(100) }).strict(),
    handler: ({ term }) => navigate(`/catalog?search=${encodeURIComponent(term)}`),
  }),
];
```

The assistant can request only the actions you return. The SDK validates every payload against `schema` before your handler runs. Set `requiresConfirmation: true` for changes the user must approve, and `available` to offer an action only on some pages. Your backend still authorizes every operation.

To refuse with a reason the user may see, throw `createIntegrationError(ERROR_CODES.ACTION_NOT_AVAILABLE, { code: 'OFFER_REQUIRED', message: 'Choose an offer first.' })`. Other handler errors reach the assistant as a generic `EXECUTION_FAILED`.

## 5. Mark targets and publish page data

`CatalogPage.tsx`:

```tsx
import { usePageEntities, useUiTarget } from 'assistant-bridge/react';

const CatalogPage = ({ product }: { product: Product }) => {
  const { ref } = useUiTarget<HTMLInputElement>('catalog-search', { label: 'Search' });

  usePageEntities([{ type: 'product', id: product.id, label: product.name }]);

  return (
    <main>
      <h1>Catalog</h1>
      <input ref={ref} aria-label="Search catalog" />
    </main>
  );
};
```

- `useUiTarget` lets the assistant point at the control (`ui.highlight`, `ui.scrollTo`, `ui.focus`) while it is mounted. With `highlight` on `AssistantHost`, highlighted elements get an outline; otherwise style `[data-assistant-highlight]` yourself.
- `usePageEntities` tells the assistant what the page shows, and removes it on unmount. Publish only data the user may see.

Both hooks do nothing outside `AssistantHost`, so shared components can use them unconditionally.

## 6. Embed the chat

Pick one, depending on where the chat runs.

**Same React tree.** Set `connection="embedded"` on `AssistantHost` and pass the connection to the chat:

```tsx
import { useAssistantHost } from 'assistant-bridge/react';

const ChatSlot = () => {
  const embedded = useAssistantHost()?.embedded;

  return embedded ? <Chat bridge={embedded.bridge} onReady={embedded.onReady} /> : null;
};
```

**Separate application, Module Federation:**

```tsx
import { AssistantEmbed } from 'assistant-bridge/react';

<AssistantEmbed
  config={{
    mode: 'federation',
    federation: {
      runtimeName: 'host_app',
      remoteName: 'assistant_chat',
      exposedModule: 'EmbeddedAssistant',
      entry: 'https://chat.example.com/remoteEntry.js',
    },
    loadAdapter: () => import('assistant-bridge/react/federation'),
  }}
  onStatus={setStatus}
/>;
```

The host also installs `@module-federation/runtime@2.9.2` and configures its build plugin; `runtimeName` must match it. See [federation](federation.md).

**Separate application, other origin (iframe):**

```tsx
<AssistantEmbed
  config={{ mode: 'iframe', iframe: { url: 'https://chat.example.com/', title: 'Assistant' } }}
  onStatus={setStatus}
/>
```

The SDK performs the origin-checked handshake. `onStatus` receives `loading`, `ready` or `error`, so the host can show its own loading and error UI. For an open/close panel with a retry button, see `useAssistantPanel` and [unified embedding](react.md#unified-assistant-embedding).

## 7. Ask the assistant from the host

```tsx
import { useAssistantHost } from 'assistant-bridge/react';

const AskButton = () => {
  const host = useAssistantHost();

  return (
    <button onClick={() => void host?.ask('Summarize this page').catch(showError)}>
      Ask the assistant
    </button>
  );
};
```

`ask` opens the chat and submits the prompt. It rejects when no assistant is connected.

## Responsibilities

| Host supplies                              | SDK handles                                             |
| ------------------------------------------ | ------------------------------------------------------- |
| Pages, router callbacks and business rules | Page context, destinations and `ui.navigate`            |
| Actions, schemas and handlers              | Payload validation, availability, approval and timeouts |
| Target IDs, elements and styles            | Target registration and highlight/scroll/focus          |
| Panel layout, loading and error UI         | Connection handshake, readiness and cleanup             |
| A compatible chat application              | The host/assistant contract                             |

## Without React, or with full control

`AssistantHost` is built from `createHostIntegration`, `useHostIntegration` and `useHostPageContext`. Use them directly only when you need behavior `AssistantHost` does not offer; see the [Core API](core.md) and [React reference](react.md#managed-host-integration).
