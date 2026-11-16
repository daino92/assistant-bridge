import type { AssistantCommandHandler } from '@/assistant-client';
import {
  ASSISTANT_COMMAND_NAMES,
  ERROR_CODES,
  assistantCommandRequestSchema,
  assistantPrefillPayloadSchema,
  assistantSubmitPromptPayloadSchema,
} from '@/contracts';
import { createIntegrationError } from '@/errors';

/**
 * Chat callbacks for host commands. Each one does the work and returns nothing; throw (or reject)
 * to refuse, for example when a prompt arrives while a reply is running. The dispatcher answers
 * the host with the contract's result (`{ opened: true }`, `{ accepted: true }`, …).
 */
export interface AssistantCommandCallbacks {
  onOpen?: () => unknown | Promise<unknown>;
  onClose?: () => unknown | Promise<unknown>;
  onFocus?: () => unknown | Promise<unknown>;
  onPrefill?: (text: string) => unknown | Promise<unknown>;
  onSubmit?: (prompt: string, metadata?: Record<string, unknown>) => unknown | Promise<unknown>;
}

/**
 * Runs the callback and answers with the contract's result for the command. The callback's
 * own return value is ignored; it refuses by throwing.
 */
const invoke = <T>(callback: (() => unknown) | undefined, result: T): Promise<T> => {
  if (!callback) {
    throw createIntegrationError(ERROR_CODES.UNKNOWN_COMMAND);
  }

  return Promise.resolve(callback()).then(() => result);
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
          { accepted: true },
        );
      }

      default:
        throw createIntegrationError(ERROR_CODES.UNKNOWN_COMMAND);
    }
  };
};
