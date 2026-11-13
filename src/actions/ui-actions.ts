import { createIntegrationError, isIntegrationErrorCode } from '@/errors';
import { z } from 'zod';

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
  uiClearHighlightPayloadSchema,
  uiActivateTabPayloadSchema,
  uiSetExpandedPayloadSchema,
  uiSetCheckedPayloadSchema,
  uiSetValuePayloadSchema,
} from '@/contracts';
import type { HostActionInput } from '@/actions';

const targetMiss = (error?: string): never => {
  throw createIntegrationError(
    isIntegrationErrorCode(error) ? error : ERROR_CODES.TARGET_NOT_FOUND,
  );
};

export type NavigateParams = Record<string, unknown>;

/** A route whose state lives in query parameters, validated before the host builds the URL. */
export interface NavigateRoute {
  /**
   * Object schema for the route parameters. Prefer `.strict()` so unknown keys are rejected.
   * Make it `.optional()` when the page also opens without parameters.
   */
  params: z.ZodType<NavigateParams | undefined>;
  /** Optional hint for the assistant, for example "Entries of one model". */
  description?: string;
}

export interface NavigateActionOptions {
  /**
   * Called with validated parameters for `routes`, and with the path only for
   * `allowedRoutes` / `detailPattern`. The host builds the final URL.
   */
  navigate: (path: string, params?: NavigateParams) => void | Promise<void>;
  /** Exact paths that take no parameters. */
  allowedRoutes?: readonly string[];
  detailPattern?: RegExp;
  /** Paths that take structured parameters, keyed by exact path. */
  routes?: Readonly<Record<string, NavigateRoute>>;
  /** Runs after the route allowlist check and before `navigate`. Throw `createIntegrationError` with optional business `reason`. */
  beforeNavigate?: (path: string, params?: NavigateParams) => void | Promise<void>;
}

export type NavigatePayload = { path: string; params?: NavigateParams };

const navigateSchema = (
  routes: Readonly<Record<string, NavigateRoute>>,
): z.ZodType<NavigatePayload> => {
  const entries = Object.entries(routes);

  if (!entries.length) {
    return uiNavigatePayloadSchema;
  }

  // Route branches come first; the plain branch is strict so stray parameters fail validation.
  const branches = entries.map(([path, route]) => {
    const branch = z.object({ path: z.literal(path), params: route.params });

    return route.description ? branch.describe(route.description) : branch;
  });

  const [first, ...rest]: z.ZodType<NavigatePayload>[] = [
    ...branches,
    uiNavigatePayloadSchema.strict(),
  ];

  return z.union([first, ...rest]);
};

export const navigateAction = (deps: NavigateActionOptions): HostActionInput<NavigatePayload> => {
  const routes = deps.routes ?? {};
  const allowedRoutes = deps.allowedRoutes ?? [];

  return {
    name: HOST_ACTION_NAMES.UI_NAVIGATE,
    description: Object.keys(routes).length
      ? 'Navigate to an allowed application route. Routes with parameters require `params`.'
      : 'Navigate to an allowed application route',
    schema: navigateSchema(routes),
    async handler({ path, params }) {
      const route = Object.hasOwn(routes, path) ? routes[path] : undefined;

      if (route) {
        const parsed = route.params.safeParse(params);

        if (!parsed.success) {
          throw createIntegrationError(ERROR_CODES.INVALID_PAYLOAD);
        }

        // An optional schema may yield no parameters; navigate like a plain route then.
        if (parsed.data === undefined) {
          await deps.beforeNavigate?.(path);
          await deps.navigate(path);

          return { path };
        }

        await deps.beforeNavigate?.(path, parsed.data);
        await deps.navigate(path, parsed.data);

        return { path, params: parsed.data };
      }

      const allowed = allowedRoutes.includes(path) || (deps.detailPattern?.test(path) ?? false);

      if (!allowed || params !== undefined) {
        throw createIntegrationError(ERROR_CODES.ACTION_NOT_AVAILABLE);
      }

      if (deps.beforeNavigate) {
        await deps.beforeNavigate(path);
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
    async handler({ targetId, value }) {
      const result = await targets.select(targetId, value);

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

export const setValueAction = (
  targets: UiTargetRegistry,
): HostActionInput<z.infer<typeof uiSetValuePayloadSchema>> => {
  return {
    name: HOST_ACTION_NAMES.UI_SET_VALUE,
    description: 'Set the value of a registered UI target',
    schema: uiSetValuePayloadSchema,
    handler({ targetId, value }) {
      const result = targets.setValue(targetId, value);

      if (!result.success) {
        targetMiss(result.error);
      }

      return { targetId, value };
    },
  };
};

export const setCheckedAction = (
  targets: UiTargetRegistry,
): HostActionInput<z.infer<typeof uiSetCheckedPayloadSchema>> => {
  return {
    name: HOST_ACTION_NAMES.UI_SET_CHECKED,
    description: 'Set the checked state of a registered UI target',
    schema: uiSetCheckedPayloadSchema,
    handler({ targetId, checked }) {
      const result = targets.setChecked(targetId, checked);

      if (!result.success) {
        targetMiss(result.error);
      }

      return { targetId, checked };
    },
  };
};

export const setExpandedAction = (
  targets: UiTargetRegistry,
): HostActionInput<z.infer<typeof uiSetExpandedPayloadSchema>> => {
  return {
    name: HOST_ACTION_NAMES.UI_SET_EXPANDED,
    description: 'Set the expanded state of a registered UI target',
    schema: uiSetExpandedPayloadSchema,
    handler({ targetId, expanded }) {
      const result = targets.setExpanded(targetId, expanded);

      if (!result.success) {
        targetMiss(result.error);
      }

      return { targetId, expanded };
    },
  };
};

export const activateTabAction = (
  targets: UiTargetRegistry,
): HostActionInput<z.infer<typeof uiActivateTabPayloadSchema>> => {
  return {
    name: HOST_ACTION_NAMES.UI_ACTIVATE_TAB,
    description: 'Activate a registered tab',
    schema: uiActivateTabPayloadSchema,
    handler({ targetId }) {
      const result = targets.activateTab(targetId);

      if (!result.success) {
        targetMiss(result.error);
      }

      return { targetId };
    },
  };
};

export const clearHighlightAction = (
  targets: UiTargetRegistry,
): HostActionInput<z.infer<typeof uiClearHighlightPayloadSchema>> => {
  return {
    name: HOST_ACTION_NAMES.UI_CLEAR_HIGHLIGHT,
    description: 'Clear the highlight of a registered UI target',
    schema: uiClearHighlightPayloadSchema,
    handler({ targetId }) {
      const result = targets.clearTargetHighlight(targetId);

      if (!result.success) {
        targetMiss(result.error);
      }

      return { targetId };
    },
  };
};
