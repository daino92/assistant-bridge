import { z } from 'zod';

export const hostCapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  parametersSchema: z.record(z.string(), z.unknown()),
  requiresConfirmation: z.boolean(),
});

export type HostCapability = z.infer<typeof hostCapabilitySchema>;

export const hostContextSchema = z.object({
  route: z.string(),
  page: z.object({
    title: z.string(),
    type: z.string(),
  }),
  selection: z
    .object({
      type: z.string(),
      id: z.string(),
    })
    .optional(),
  entities: z
    .array(
      z.object({
        type: z.string(),
        id: z.string(),
        label: z.string(),
        reference: z.string().optional(),
        aliases: z.array(z.string()).optional(),
        attributes: z.record(z.string(), z.string()).optional(),
      }),
    )
    .optional(),
  capabilities: z.array(hostCapabilitySchema),
  destinations: z.array(z.object({ path: z.string(), label: z.string() })).optional(),
  targets: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string().optional(),
        actions: z.array(
          z.enum([
            'highlight',
            'scrollTo',
            'focus',
            'select',
            'setValue',
            'setChecked',
            'setExpanded',
            'activateTab',
            'clearHighlight',
          ]),
        ),
      }),
    )
    .optional(),
  revision: z.number().int().nonnegative(),
});

export type HostContext = z.infer<typeof hostContextSchema>;
