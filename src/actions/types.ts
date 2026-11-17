import type { z } from 'zod';

import type { ActionExecutionContext } from '@/action-registry';
import type { ActionPreview, HostContext } from '@/contracts';

export interface HostActionInput<TPayload = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TPayload>;
  requiresConfirmation?: boolean;
  available?: (ctx: HostContext) => boolean;
  /**
   * Pass the message of an ordinary `Error` thrown by the handler to the assistant as a public
   * reason: `ACTION_NOT_AVAILABLE` with reason code `ACTION_FAILED`, at most 300 characters.
   * Use it only when your errors are safe for the user, such as backend validation messages.
   * Without it the assistant gets a generic `EXECUTION_FAILED`. Errors from
   * `createIntegrationError` keep their own code.
   */
  exposeErrorMessages?: boolean;
  /** Read-only; called with validated arguments before approval. Never perform writes here. */
  preview?(payload: TPayload, ctx: ActionExecutionContext): ActionPreview | Promise<ActionPreview>;
  handler(payload: TPayload, ctx: ActionExecutionContext): Promise<unknown> | unknown;
}

export const defineAction = <TPayload>(
  action: HostActionInput<TPayload>,
): HostActionInput<TPayload> => action;
