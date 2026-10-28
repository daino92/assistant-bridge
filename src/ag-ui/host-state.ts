import { z } from 'zod';

export const hostAgentStateSchema = z.object({
  tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.record(z.string(), z.unknown()),
      }),
    )
    .max(32),
  context: z.array(z.object({ description: z.string(), value: z.string() })).max(10),
});

export type HostAgentState = z.infer<typeof hostAgentStateSchema>;
