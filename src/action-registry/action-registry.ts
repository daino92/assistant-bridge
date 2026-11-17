import { z } from 'zod';

import {
  ERROR_CODES,
  actionPreviewSchema,
  type ActionPreview,
  type HostContext,
  type StructuredError,
} from '@/contracts';
import { isIntegrationErrorCode, normalizeIntegrationError } from '@/errors';

export interface ActionExecutionContext {
  getContext: () => HostContext;
  minContextRevision?: number;
  confirmed?: boolean;
}

export interface RegisteredAction<TPayload = unknown> {
  name: string;
  description: string;
  parametersSchema: z.ZodType<TPayload>;
  requiresConfirmation: boolean;
  isAvailable?: (ctx: HostContext) => boolean;
  /** See `HostActionInput.exposeErrorMessages`. */
  exposeErrorMessages?: boolean;
  preview?: (
    payload: TPayload,
    ctx: ActionExecutionContext,
  ) => ActionPreview | Promise<ActionPreview>;
  handler: (payload: TPayload, ctx: ActionExecutionContext) => Promise<unknown> | unknown;
}

export interface ActionRegistryEntry {
  action: RegisteredAction;
}

/**
 * For actions with `exposeErrorMessages`: an ordinary `Error` becomes `ACTION_NOT_AVAILABLE`
 * with its message as the public reason, the same shape as `createIntegrationError` with a
 * reason. `EXECUTION_FAILED` never carries a reason, so raw failures stay generic.
 */
const toStructuredError = (error: unknown, exposeMessage: boolean): StructuredError => {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;

  if (!exposeMessage || isIntegrationErrorCode(code) || !(error instanceof Error)) {
    return normalizeIntegrationError(error);
  }

  const message = error.message.trim().slice(0, 300);

  if (!message) {
    return normalizeIntegrationError(error);
  }

  return normalizeIntegrationError({
    code: ERROR_CODES.ACTION_NOT_AVAILABLE,
    reason: { code: 'ACTION_FAILED', message },
  });
};

const parameterSchemas = new WeakMap<z.ZodType, Record<string, unknown>>();

/**
 * JSON Schema published for an action's parameters, cached per Zod schema object, so
 * republishing capabilities on every host render stays cheap.
 */
export const toParametersSchema = (schema: z.ZodType): Record<string, unknown> => {
  let converted = parameterSchemas.get(schema);

  if (!converted) {
    converted = z.toJSONSchema(schema, { io: 'input', target: 'draft-7' }) as Record<
      string,
      unknown
    >;
    parameterSchemas.set(schema, converted);
  }

  return converted;
};

export class HostActionRegistry {
  private actions = new Map<string, RegisteredAction>();

  register<T>(action: RegisteredAction<T>): void {
    if (this.actions.has(action.name)) {
      throw new Error(`Action already registered: ${action.name}`);
    }

    this.actions.set(action.name, action as RegisteredAction);
  }

  clear(): void {
    this.actions.clear();
  }

  unregister(name: string): void {
    this.actions.delete(name);
  }

  getCapabilities(context?: HostContext): Array<{
    name: string;
    description: string;
    parametersSchema: Record<string, unknown>;
    requiresConfirmation: boolean;
    hasPreview?: boolean;
  }> {
    return Array.from(this.actions.values())
      .filter((action) => !context || !action.isAvailable || action.isAvailable(context))
      .map((a) => ({
        name: a.name,
        description: a.description,
        parametersSchema: toParametersSchema(a.parametersSchema),
        requiresConfirmation: a.requiresConfirmation,
        ...(a.preview ? { hasPreview: true } : {}),
      }));
  }

  hasAction(name: string): boolean {
    return this.actions.has(name);
  }

  async preview(
    name: string,
    rawPayload: unknown,
    execCtx: ActionExecutionContext,
  ): Promise<{ success: true; data?: ActionPreview } | { success: false; error: StructuredError }> {
    const action = this.actions.get(name);

    if (!action) {
      return {
        success: false,
        error: normalizeIntegrationError({ code: ERROR_CODES.UNKNOWN_ACTION }),
      };
    }

    const context = execCtx.getContext();

    if (action.isAvailable && !action.isAvailable(context)) {
      return {
        success: false,
        error: normalizeIntegrationError({ code: ERROR_CODES.ACTION_NOT_AVAILABLE }),
      };
    }

    if (execCtx.minContextRevision !== undefined && context.revision < execCtx.minContextRevision) {
      return {
        success: false,
        error: normalizeIntegrationError({ code: ERROR_CODES.STALE_CONTEXT }),
      };
    }

    const parsed = action.parametersSchema.safeParse(rawPayload);

    if (!parsed.success) {
      return {
        success: false,
        error: normalizeIntegrationError({ code: ERROR_CODES.INVALID_PAYLOAD }),
      };
    }

    if (!action.preview) {
      return { success: true };
    }

    try {
      const preview = actionPreviewSchema.safeParse(await action.preview(parsed.data, execCtx));

      return preview.success
        ? { success: true, data: preview.data }
        : {
            success: false,
            error: normalizeIntegrationError({ code: ERROR_CODES.INVALID_PAYLOAD }),
          };
    } catch (error) {
      return {
        success: false,
        error: toStructuredError(error, action.exposeErrorMessages ?? false),
      };
    }
  }

  async execute(
    name: string,
    rawPayload: unknown,
    execCtx: ActionExecutionContext,
  ): Promise<{ success: true; data?: unknown } | { success: false; error: StructuredError }> {
    const action = this.actions.get(name);

    if (!action) {
      return {
        success: false,
        error: normalizeIntegrationError({ code: ERROR_CODES.UNKNOWN_ACTION }),
      };
    }

    const hostCtx = execCtx.getContext();

    if (action.requiresConfirmation && !execCtx.confirmed) {
      return {
        success: false,
        error: normalizeIntegrationError({ code: ERROR_CODES.CONFIRMATION_REQUIRED }),
      };
    }

    if (action.isAvailable && !action.isAvailable(hostCtx)) {
      return {
        success: false,
        error: normalizeIntegrationError({ code: ERROR_CODES.ACTION_NOT_AVAILABLE }),
      };
    }

    if (execCtx.minContextRevision !== undefined && hostCtx.revision < execCtx.minContextRevision) {
      return {
        success: false,
        error: normalizeIntegrationError({ code: ERROR_CODES.STALE_CONTEXT }),
      };
    }

    const parsed = action.parametersSchema.safeParse(rawPayload);

    if (!parsed.success) {
      return {
        success: false,
        error: normalizeIntegrationError({ code: ERROR_CODES.INVALID_PAYLOAD }),
      };
    }

    try {
      const data = await action.handler(parsed.data, execCtx);

      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: toStructuredError(err, action.exposeErrorMessages ?? false),
      };
    }
  }
}
