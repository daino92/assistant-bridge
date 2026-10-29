import { z } from 'zod';
import { PROTOCOL_VERSION, businessReasonSchema } from './protocol';

export const hostActionRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().uuid(),
  action: z.string(),
  actionExecutionId: z.string().uuid().optional(),
  payload: z.unknown(),
  contextRevision: z.number().int().optional(),
  confirmed: z.boolean().optional(),
});

export type HostActionRequest = z.infer<typeof hostActionRequestSchema>;

export const hostActionResultSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().uuid(),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      reason: businessReasonSchema.optional(),
    })
    .optional(),
});

export type HostActionResult = z.infer<typeof hostActionResultSchema>;

/** Generic UI action payloads */
export const uiNavigatePayloadSchema = z.object({
  path: z.string(),
});

export const uiHighlightPayloadSchema = z.object({
  targetId: z.string(),
  durationMs: z.number().int().positive().optional(),
});

export const uiScrollToPayloadSchema = z.object({
  targetId: z.string(),
  behavior: z.enum(['auto', 'smooth']).optional(),
});

export const uiFocusPayloadSchema = z.object({
  targetId: z.string(),
});

export const uiSelectPayloadSchema = z.object({
  targetId: z.string(),
  value: z.string().optional(),
});

export const uiOpenDetailsPayloadSchema = z.object({
  entityType: z.enum(['catalog', 'record']),
  id: z.string(),
});

export const catalogFilterPayloadSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
});

export const recordsFilterPayloadSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['active', 'pending', 'archived', 'all']).optional(),
});

export const recordsSortPayloadSchema = z.object({
  field: z.enum(['name', 'status', 'updatedAt', 'owner']),
  direction: z.enum(['asc', 'desc']),
});

export const HOST_ACTION_NAMES = {
  UI_NAVIGATE: 'ui.navigate',
  UI_HIGHLIGHT: 'ui.highlight',
  UI_SCROLL_TO: 'ui.scrollTo',
  UI_FOCUS: 'ui.focus',
  UI_SELECT: 'ui.select',
  UI_OPEN_DETAILS: 'ui.openDetails',
  CATALOG_FILTER: 'catalog.filter',
  RECORDS_FILTER: 'records.filter',
  RECORDS_SORT: 'records.sort',
} as const;
