import { ERROR_CODES, type ErrorCode, type StructuredError } from '@/contracts';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  ACTION_REJECTED: 'The user rejected this action. No changes were made.',
  UNKNOWN_ACTION: 'This host action is not supported.',
  UNKNOWN_COMMAND: 'This assistant command is not supported.',
  INVALID_PAYLOAD: 'The requested change is invalid. Check its values and try again.',
  ACTION_NOT_AVAILABLE: 'This action is unavailable on the current page.',
  RECEIVER_UNAVAILABLE: 'Assistant disconnected or unavailable. Please reconnect and try again.',
  TARGET_NOT_FOUND: 'This element is no longer available on the page.',
  STALE_CONTEXT: 'The data changed while awaiting approval. Request the action again.',
  CONFIRMATION_REQUIRED: 'User approval is required for this action.',
  TIMEOUT: 'The request timed out. Please try again.',
  EXECUTION_FAILED: 'The host action failed. Please try again.',
  RESOURCE_NOT_FOUND: 'This item no longer exists. Refresh the page before trying again.',
  SERVICE_UNAVAILABLE: 'Cannot reach the service. Check that the BFF is running and try again.',
};

export const isIntegrationErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && Object.hasOwn(ERROR_CODES, value);

/** Preserve recognized codes, never arbitrary messages, stacks, payloads or provider details. */
export const normalizeIntegrationError = (error: unknown): StructuredError => {
  const supplied = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const code = isIntegrationErrorCode(supplied) ? supplied : ERROR_CODES.EXECUTION_FAILED;

  return { code, message: ERROR_MESSAGES[code] };
};

export const createIntegrationError = (code: ErrorCode): Error & StructuredError => {
  const detail = normalizeIntegrationError({ code });

  return Object.assign(new Error(detail.message), { code: detail.code });
};
