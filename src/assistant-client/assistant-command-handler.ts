import { normalizeIntegrationError } from '@/errors';
import type { HostBridge } from '@/bridge';
import {
  assistantCommandRequestSchema,
  assistantCommandResultSchema,
  PROTOCOL_VERSION,
  type AssistantCommandRequest,
} from '@/contracts';

export type AssistantCommandHandler = (
  request: AssistantCommandRequest,
) => unknown | Promise<unknown>;

/** Connect a same-window receiver without exposing the host bridge to the chat. */
export const attachAssistantCommandHandler = (
  bridge: HostBridge,
  handler: AssistantCommandHandler,
): (() => void) => {
  let active = true;

  const unsubscribe = bridge.bus.on('assistant.command.request', (request) => {
    void Promise.resolve()
      .then(() => (active ? handler(assistantCommandRequestSchema.parse(request)) : undefined))
      .then(
        (data) => {
          if (!active) {
            return;
          }

          bridge.bus.emit(
            'assistant.command.result',
            assistantCommandResultSchema.parse({
              protocolVersion: PROTOCOL_VERSION,
              requestId: request.requestId,
              success: true,
              data,
            }),
          );
        },
        (error: unknown) => {
          if (!active) {
            return;
          }

          bridge.bus.emit(
            'assistant.command.result',
            assistantCommandResultSchema.parse({
              protocolVersion: PROTOCOL_VERSION,
              requestId: request.requestId,
              success: false,
              error: normalizeIntegrationError(error),
            }),
          );
        },
      );
  });

  return () => {
    active = false;
    unsubscribe();
  };
};
