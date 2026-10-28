import type { z } from 'zod';

import type { ActionExecutionContext } from '@/action-registry';
import type { HostContext } from '@/contracts';

export interface HostActionInput<TPayload = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TPayload>;
  requiresConfirmation?: boolean;
  available?: (ctx: HostContext) => boolean;
  handler(payload: TPayload, ctx: ActionExecutionContext): Promise<unknown> | unknown;
}

export const defineAction = <TPayload>(
  action: HostActionInput<TPayload>,
): HostActionInput<TPayload> => action;
