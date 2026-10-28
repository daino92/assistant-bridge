import { z } from 'zod';

import { ERROR_CODES, type HostContext, type StructuredError } from '@/contracts';
import { normalizeIntegrationError } from '@/errors';

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
  handler: (payload: TPayload, ctx: ActionExecutionContext) => Promise<unknown> | unknown;
}

export interface ActionRegistryEntry {
  action: RegisteredAction;
}

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
  }> {
    return Array.from(this.actions.values())
      .filter((action) => !context || !action.isAvailable || action.isAvailable(context))
      .map((a) => ({
        name: a.name,
        description: a.description,
        parametersSchema: z.toJSONSchema(a.parametersSchema, { io: 'input', target: 'draft-7' }),
        requiresConfirmation: a.requiresConfirmation,
      }));
  }

  hasAction(name: string): boolean {
    return this.actions.has(name);
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
        error: normalizeIntegrationError(err),
      };
    }
  }
}
