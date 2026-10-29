import { z } from 'zod';

import { businessReasonSchema } from './protocol';

export const actionLifecycleStatusSchema = z.enum([
  'requested',
  'awaiting-approval',
  'running',
  'succeeded',
  'failed',
  'rejected',
  'cancelled',
]);

/** Observational metadata only: never include action arguments or results. */
export const actionLifecycleEventSchema = z.object({
  actionExecutionId: z.string().uuid(),
  action: z.string().min(1),
  toolCallId: z.string().optional(),
  sequence: z.number().int().nonnegative(),
  status: actionLifecycleStatusSchema,
  timestamp: z.number().nonnegative(),
  dispatched: z.boolean(),
  error: z
    .object({ code: z.string(), message: z.string(), reason: businessReasonSchema.optional() })
    .optional(),
});

export type ActionLifecycleEvent = z.infer<typeof actionLifecycleEventSchema>;
export type ActionLifecycleStatus = z.infer<typeof actionLifecycleStatusSchema>;

export type ActionLifecycleListener = (
  event: ActionLifecycleEvent,
  details?: { args: unknown },
) => void;
