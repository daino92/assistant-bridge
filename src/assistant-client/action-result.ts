import { ERROR_CODES, type StructuredError } from '@/contracts';
import { normalizeIntegrationError } from '@/errors';

export type ActionExecutionResult =
  | { status: 'succeeded'; data: unknown }
  | { status: 'rejected' | 'cancelled' | 'failed'; error: StructuredError };

/** Shared by core and React; does not expose arbitrary exception messages. */
export const captureActionResult = async (
  operation: () => Promise<unknown>,
  signal?: AbortSignal,
): Promise<ActionExecutionResult> => {
  try {
    return { status: 'succeeded', data: await operation() };
  } catch (error) {
    const detail = normalizeIntegrationError(error);

    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return { status: 'cancelled', error: detail };
    }

    return {
      status: detail.code === ERROR_CODES.ACTION_REJECTED ? 'rejected' : 'failed',
      error: detail,
    };
  }
};
