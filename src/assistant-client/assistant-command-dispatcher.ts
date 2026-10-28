import type { AssistantCommandHandler } from '@/assistant-client';
import {
  ASSISTANT_COMMAND_NAMES,
  ERROR_CODES,
  assistantCommandRequestSchema,
  assistantPrefillPayloadSchema,
  assistantSubmitPromptPayloadSchema,
} from '@/contracts';
import { createIntegrationError } from '@/errors';

export interface AssistantCommandCallbacks {
  onOpen?: () => unknown | Promise<unknown>;
  onClose?: () => unknown | Promise<unknown>;
  onFocus?: () => unknown | Promise<unknown>;
  onPrefill?: (text: string) => unknown | Promise<unknown>;
  onSubmit?: (prompt: string, metadata?: Record<string, unknown>) => unknown | Promise<unknown>;
}

const invoke = (callback: (() => unknown) | undefined, acknowledgement: unknown) => {
  if (!callback) {
    throw createIntegrationError(ERROR_CODES.UNKNOWN_COMMAND);
  }

  return Promise.resolve(callback()).then((result) => result ?? acknowledgement);
};

/** Validates and routes commands without owning input, focus, storage or run state. */
export const createAssistantCommandDispatcher = (
  callbacks: AssistantCommandCallbacks,
): AssistantCommandHandler => {
  const handlers = { ...callbacks };

  return (request) => {
    const parsed = assistantCommandRequestSchema.safeParse(request);

    if (!parsed.success) {
      throw createIntegrationError(ERROR_CODES.INVALID_PAYLOAD);
    }

    switch (parsed.data.command) {
      case ASSISTANT_COMMAND_NAMES.OPEN:
        return invoke(handlers.onOpen, { opened: true });
      case ASSISTANT_COMMAND_NAMES.CLOSE:
        return invoke(handlers.onClose, { closed: true });
      case ASSISTANT_COMMAND_NAMES.FOCUS:
        return invoke(handlers.onFocus, { focused: true });
      case ASSISTANT_COMMAND_NAMES.PREFILL: {
        const payload = assistantPrefillPayloadSchema.safeParse(parsed.data.payload);

        if (!payload.success) {
          throw createIntegrationError(ERROR_CODES.INVALID_PAYLOAD);
        }

        return invoke(
          handlers.onPrefill ? () => handlers.onPrefill!(payload.data.text) : undefined,
          { prefilled: true },
        );
      }

      case ASSISTANT_COMMAND_NAMES.SUBMIT_PROMPT: {
        const payload = assistantSubmitPromptPayloadSchema.safeParse(parsed.data.payload);

        if (!payload.success) {
          throw createIntegrationError(ERROR_CODES.INVALID_PAYLOAD);
        }

        return invoke(
          handlers.onSubmit
            ? () => handlers.onSubmit!(payload.data.prompt, payload.data.metadata)
            : undefined,
          { acknowledged: true },
        );
      }

      default:
        throw createIntegrationError(ERROR_CODES.UNKNOWN_COMMAND);
    }
  };
};
