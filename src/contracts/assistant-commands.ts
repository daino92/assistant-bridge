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

export const assistantPrefillPayloadSchema = z.object({
  text: z.string(),
});

export const assistantSubmitPromptPayloadSchema = z.object({
  prompt: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
