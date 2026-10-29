import { z } from 'zod';

export const PROTOCOL_VERSION = '1.0.0';

/** Shared iframe handshake names, independent of a host application's branding. */
export const ASSISTANT_IFRAME_MESSAGES = {
  READY: 'assistant.iframe.ready',
  CONNECT: 'assistant.iframe.connect',
  CONNECTED: 'assistant.iframe.connected',
} as const;

export const ERROR_CODES = {
  ACTION_REJECTED: 'ACTION_REJECTED',
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  ACTION_NOT_AVAILABLE: 'ACTION_NOT_AVAILABLE',
  RECEIVER_UNAVAILABLE: 'RECEIVER_UNAVAILABLE',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  STALE_CONTEXT: 'STALE_CONTEXT',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  TIMEOUT: 'TIMEOUT',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Explicit host-authored public guidance, never raw exception details. */
export const businessReasonSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
  message: z.string().trim().min(1).max(300),
});

export type BusinessReason = z.infer<typeof businessReasonSchema>;

export interface StructuredError {
  code: ErrorCode;
  message: string;
  reason?: BusinessReason;
}
