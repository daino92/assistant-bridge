import { z } from 'zod';
import { PROTOCOL_VERSION, businessReasonSchema } from './protocol';

export const assistantCommandRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().uuid(),
  command: z.string(),
  payload: z.unknown(),
});

export type AssistantCommandRequest = z.infer<typeof assistantCommandRequestSchema>;

export const assistantCommandResultSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().uuid(),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      reason: businessReasonSchema.optional(),
    })
    .optional(),
});

export type AssistantCommandResult = z.infer<typeof assistantCommandResultSchema>;

export const ASSISTANT_COMMAND_NAMES = {
  OPEN: 'assistant.open',
  CLOSE: 'assistant.close',
  FOCUS: 'assistant.focus',
  PREFILL: 'assistant.prefill',
  SUBMIT_PROMPT: 'assistant.submitPrompt',
} as const;

/**
 * What the assistant answers to each command. A command it cannot carry out (for example a
 * prompt while a reply is running) is an error result, not `false`.
 */
export const assistantCommandResultDataSchemas = {
  [ASSISTANT_COMMAND_NAMES.OPEN]: z.object({ opened: z.literal(true) }),
  [ASSISTANT_COMMAND_NAMES.CLOSE]: z.object({ closed: z.literal(true) }),
  [ASSISTANT_COMMAND_NAMES.FOCUS]: z.object({ focused: z.literal(true) }),
  [ASSISTANT_COMMAND_NAMES.PREFILL]: z.object({ prefilled: z.literal(true) }),
  [ASSISTANT_COMMAND_NAMES.SUBMIT_PROMPT]: z.object({ accepted: z.literal(true) }),
} as const;

export type AssistantCommandName =
  (typeof ASSISTANT_COMMAND_NAMES)[keyof typeof ASSISTANT_COMMAND_NAMES];

/** Result data per command, for example `{ accepted: true }` for `assistant.submitPrompt`. */
export type AssistantCommandResultData = {
  [K in AssistantCommandName]: z.infer<(typeof assistantCommandResultDataSchemas)[K]>;
};

export const assistantPrefillPayloadSchema = z.object({
  text: z.string(),
});

export const assistantSubmitPromptPayloadSchema = z.object({
  prompt: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
