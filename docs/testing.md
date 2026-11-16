# Testing a host

`assistant-bridge/testing` connects a test assistant to your integration. It behaves like a real assistant for the checks that matter in host tests: it sees the published context, requests actions through the same executor (availability, approval, payload validation, public errors) and answers host commands by contract. Tests do not need to know the wire protocol or the SDK internals.

It has no React dependency and is not bundled into an application that does not import it.

## Connect

```ts
import { createHostIntegration } from 'assistant-bridge';
import { connectTestAssistant } from 'assistant-bridge/testing';

const integration = createHostIntegration({ actions: createActions(deps) });
const assistant = connectTestAssistant(integration, { approve: true });

afterEach(() => {
  assistant.dispose();
  integration.dispose();
});
```

With React, render your provider and take the integration from `useAssistantHost()?.integration`.

## Check what the assistant may do

```ts
expect(assistant.capabilities()).toContain('cms.publishEntry');
expect(assistant.context().principal?.permissions).toEqual(['content:read']);
```

`capabilities()` lists the actions available on the current page and to the current principal, as the assistant sees them.

## Run actions

```ts
await expect(assistant.run('cms.publishEntry', { entryId, expectedVersion: 3 })).resolves.toEqual({
  published: entryId,
});

await expect(assistant.run('cms.publishEntry', { entryId: 42 })).rejects.toMatchObject({
  code: 'INVALID_PAYLOAD',
});
```

`run` resolves with the handler's result or rejects with an `Error` that carries `code`, and `reason` for public refusals (for example from `exposeErrorMessages`).

- **Approval:** `approve` answers approval requests for actions with `requiresConfirmation`: `false` (default) declines, `true` approves, a function decides per request. Declined actions reject with `ACTION_REJECTED` and their handler does not run. `assistant.confirmations` lists what was asked.
- **Navigation:** a real assistant waits, after `ui.navigate`, until the host publishes the new route. The test assistant does not, because test routers often do not change the route. Pass `waitForNavigation: true` to wait.

## Host commands

The test assistant answers `open`, `close`, `focus`, `prefill` and `submitPrompt` with the contract results and records them:

```ts
await integration.assistantCommands.askAbout('Summarize this entry');

expect(assistant.commands.map((request) => request.command)).toEqual([
  'assistant.open',
  'assistant.submitPrompt',
]);
```

Pass `onCommand` to answer differently, or throw from it to simulate a busy assistant. After `dispose()`, host commands reject with `RECEIVER_UNAVAILABLE`.
