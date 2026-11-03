import { createIntegrationError, isIntegrationErrorCode } from '@/errors';
import type { z } from 'zod';

import type { UiTargetRegistry } from '@/capabilities';
import {
  ERROR_CODES,
  HOST_ACTION_NAMES,
  uiFocusPayloadSchema,
  uiHighlightPayloadSchema,
  uiNavigatePayloadSchema,
  uiOpenDetailsPayloadSchema,
  uiScrollToPayloadSchema,
  uiSelectPayloadSchema,
} from '@/contracts';
import type { HostActionInput } from '@/actions';

const targetMiss = (error?: string): never => {
  throw createIntegrationError(
    isIntegrationErrorCode(error) ? error : ERROR_CODES.TARGET_NOT_FOUND,
  );
};

export const navigateAction = (deps: {
  navigate: (path: string) => void | Promise<void>;
  allowedRoutes: readonly string[];
  detailPattern?: RegExp;
}): HostActionInput<{ path: string }> => {
  return {
    name: HOST_ACTION_NAMES.UI_NAVIGATE,
    description: 'Navigate to an allowed application route',
    schema: uiNavigatePayloadSchema,
    async handler({ path }) {
      const allowed =
        deps.allowedRoutes.includes(path) || (deps.detailPattern?.test(path) ?? false);

      if (!allowed) {
        throw createIntegrationError(ERROR_CODES.ACTION_NOT_AVAILABLE);
      }

      await deps.navigate(path);

      return { path };
    },
  };
};

export const highlightAction = (
  targets: UiTargetRegistry,
): HostActionInput<z.infer<typeof uiHighlightPayloadSchema>> => {
  return {
    name: HOST_ACTION_NAMES.UI_HIGHLIGHT,
    description: 'Highlight a registered UI target',
    schema: uiHighlightPayloadSchema,
    handler({ targetId, durationMs }) {
      const result = targets.highlight(targetId, durationMs);

      if (!result.success) {
        targetMiss(result.error);
      }

      return { targetId };
    },
  };
};

export const scrollToAction = (
  targets: UiTargetRegistry,
): HostActionInput<z.infer<typeof uiScrollToPayloadSchema>> => {
  return {
    name: HOST_ACTION_NAMES.UI_SCROLL_TO,
    description: 'Scroll to a registered UI target',
    schema: uiScrollToPayloadSchema,
    handler({ targetId, behavior }) {
      const result = targets.scrollTo(targetId, behavior ?? 'smooth');

      if (!result.success) {
        targetMiss(result.error);
      }

      return { targetId };
    },
  };
};

export const focusAction = (
  targets: UiTargetRegistry,
): HostActionInput<z.infer<typeof uiFocusPayloadSchema>> => {
  return {
    name: HOST_ACTION_NAMES.UI_FOCUS,
    description: 'Focus a registered UI target',
    schema: uiFocusPayloadSchema,
    handler({ targetId }) {
      const result = targets.focus(targetId);

      if (!result.success) {
        targetMiss(result.error);
      }

      return { targetId };
    },
  };
};

export const selectAction = (
  targets: UiTargetRegistry,
): HostActionInput<z.infer<typeof uiSelectPayloadSchema>> => {
  return {
    name: HOST_ACTION_NAMES.UI_SELECT,
    description: 'Select value on a registered UI target',
    schema: uiSelectPayloadSchema,
    handler({ targetId, value }) {
      const result = targets.select(targetId, value);

      if (!result.success) {
        targetMiss(result.error);
      }

      return { targetId, value };
    },
  };
};

export const openDetailsAction = (deps: {
  openDetails: (entityType: 'catalog' | 'record', id: string) => void;
}): HostActionInput<z.infer<typeof uiOpenDetailsPayloadSchema>> => {
  return {
    name: HOST_ACTION_NAMES.UI_OPEN_DETAILS,
    description: 'Open entity detail page',
    schema: uiOpenDetailsPayloadSchema,
    handler({ entityType, id }) {
      deps.openDetails(entityType, id);

      return { entityType, id };
    },
  };
};
