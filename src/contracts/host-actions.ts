import { z } from 'zod';
import { businessReasonSchema, protocolVersionSchema } from './protocol';

export const hostActionRequestSchema = z.object({
  protocolVersion: protocolVersionSchema,
  requestId: z.string().uuid(),
  action: z.string(),
  actionExecutionId: z.string().uuid().optional(),
  payload: z.unknown(),
  contextRevision: z.number().int().optional(),
  confirmed: z.boolean().optional(),
});

export type HostActionRequest = z.infer<typeof hostActionRequestSchema>;

export const hostActionResultSchema = z.object({
  protocolVersion: protocolVersionSchema,
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

/** Plain-text, host-owned information shown before approval. */
export const actionPreviewSchema = z
  .object({
    title: z.string().min(1).max(200),
    details: z.array(z.string().max(2000)).max(200),
  })
  .strict();

export type ActionPreview = z.infer<typeof actionPreviewSchema>;

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

export const uiSetValuePayloadSchema = z.object({
  targetId: z.string(),
  value: z.string(),
});

export const uiSetCheckedPayloadSchema = z.object({
  targetId: z.string(),
  checked: z.boolean(),
});

export const uiSetExpandedPayloadSchema = z.object({
  targetId: z.string(),
  expanded: z.boolean(),
});

export const uiActivateTabPayloadSchema = z.object({
  targetId: z.string(),
});

export const uiClearHighlightPayloadSchema = z.object({
  targetId: z.string(),
});

export const HOST_ACTION_NAMES = {
  UI_NAVIGATE: 'ui.navigate',
  UI_HIGHLIGHT: 'ui.highlight',
  UI_SCROLL_TO: 'ui.scrollTo',
  UI_FOCUS: 'ui.focus',
  UI_SELECT: 'ui.select',
  UI_CLEAR_HIGHLIGHT: 'ui.clearHighlight',
  UI_ACTIVATE_TAB: 'ui.activateTab',
  UI_SET_EXPANDED: 'ui.setExpanded',
  UI_SET_CHECKED: 'ui.setChecked',
  UI_SET_VALUE: 'ui.setValue',
} as const;
