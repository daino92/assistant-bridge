export const RUN_ERROR_CODES = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_CLOSED: 'CONNECTION_CLOSED',
  TIMEOUT: 'TIMEOUT',
  PROTOCOL_ERROR: 'PROTOCOL_ERROR',
  RESPONSE_TOO_LARGE: 'RESPONSE_TOO_LARGE',
  INVALID_REQUEST: 'INVALID_REQUEST',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  PROVIDER_AUTH_ERROR: 'PROVIDER_AUTH_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  AGENT_ERROR: 'AGENT_ERROR',
  STOPPED: 'STOPPED',
} as const;

export type RunErrorCode = (typeof RUN_ERROR_CODES)[keyof typeof RUN_ERROR_CODES];

export interface RunError {
  code: RunErrorCode;
  message: string;
}

const MESSAGES: Record<RunErrorCode, string> = {
  CONNECTION_FAILED:
    'Cannot connect to the assistant service. Check your connection and try again.',
  CONNECTION_CLOSED: 'The assistant connection closed before the reply finished. Please try again.',
  TIMEOUT: 'The assistant took too long to respond. Please try again.',
  PROTOCOL_ERROR: 'The assistant service sent an invalid response. Please try again.',
  RESPONSE_TOO_LARGE: 'The assistant response is too large. Try a more specific question.',
  INVALID_REQUEST: 'The assistant could not process this request. Please try again.',
  CONFIGURATION_ERROR: 'The assistant service is not configured. Contact your administrator.',
  PROVIDER_AUTH_ERROR:
    'The assistant service could not authenticate with the model provider. Contact your administrator.',
  RATE_LIMITED: 'The assistant is busy. Please try again shortly.',
  PROVIDER_UNAVAILABLE: 'The model provider is currently unreachable. Please try again later.',
  AGENT_ERROR: 'The assistant could not complete this request. Please try again.',
  STOPPED: 'Agent run stopped.',
};

export const isRunErrorCode = (value: unknown): value is RunErrorCode =>
  typeof value === 'string' && Object.hasOwn(RUN_ERROR_CODES, value);

/** Untrusted messages, stacks, URLs and provider bodies never become public run errors. */
export const normalizeRunError = (error: unknown): RunError => {
  const supplied = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const code = isRunErrorCode(supplied) ? supplied : RUN_ERROR_CODES.AGENT_ERROR;

  return { code, message: MESSAGES[code] };
};

export const createRunError = (code: RunErrorCode): Error & RunError => {
  const error = normalizeRunError({ code });

  return Object.assign(new Error(error.message), { code: error.code });
};

export const describeRunError = (error: unknown): string => normalizeRunError(error).message;
