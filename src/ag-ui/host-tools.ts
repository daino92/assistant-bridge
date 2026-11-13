import {
  createAssistantActionExecutor,
  type AssistantActionExecutorOptions,
  type AssistantBridgeClient,
} from '@/assistant-client';

import type { HostAgentState } from '@/ag-ui';

export const createHostAgentOptions = (
  bridge?: AssistantBridgeClient,
  options: AssistantActionExecutorOptions = {},
) => {
  const getHostState = (): HostAgentState => {
    const snapshot = bridge?.getContext();

    return {
      tools:
        snapshot?.capabilities
          .filter((item) => !item.requiresConfirmation || Boolean(options.requestConfirmation))
          .map((item) => ({
            name: item.name,
            description:
              item.description +
              (item.requiresConfirmation
                ? ' Calling this tool opens an Approve/Reject card before execution. Call it for explicit user requests; do not ask for approval in text.'
                : ''),
            parameters: item.parametersSchema,
          })) ?? [],
      context: snapshot
        ? [
            {
              description: 'Current host page and selection',
              value: JSON.stringify({
                route: snapshot.route,
                page: snapshot.page,
                selection: snapshot.selection,
                destinations: snapshot.destinations,
                targets: snapshot.targets,
                entities: snapshot.entities,
                revision: snapshot.revision,
              }),
            },
          ]
        : [],
    };
  };

  const executor = bridge ? createAssistantActionExecutor(bridge, options) : undefined;

  return {
    ...getHostState(),
    getHostState,
    executeTool:
      executor?.executeAction ??
      (async () => {
        throw new Error('Host action is unavailable.');
      }),
  };
};
