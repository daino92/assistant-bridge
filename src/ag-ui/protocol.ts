import { RunAgentInputSchema, ToolMessageSchema } from '@ag-ui/core/schemas';
import { z } from 'zod';

import { hostAgentStateSchema } from './host-state.js';

/** Application transport envelopes, not standard AG-UI events. */
export const agentControlSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run'), input: RunAgentInputSchema }),
  z.object({ type: z.literal('stop'), runId: z.string() }),
  z.object({
    type: z.literal('tool_result'),
    runId: z.string(),
    message: ToolMessageSchema,
    hostState: hostAgentStateSchema.optional(),
  }),
]);

export type AgentControl = z.infer<typeof agentControlSchema>;

/** Destinations for our connection-local STOMP binding. */
export const AGENT_STOMP_DESTINATIONS = {
  controls: '/app/agent',
  events: '/user/queue/agent',
} as const;
