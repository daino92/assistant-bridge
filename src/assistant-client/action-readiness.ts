import type { HostContext } from '@/contracts';

export interface ActionReadinessContext {
  context: HostContext;
  previousContext: HostContext;
  args: unknown;
  result: unknown;
}

export type ActionReadiness = (state: ActionReadinessContext) => boolean;

/** Override per action when a host has custom routing or additional readiness requirements. */
export const defaultActionReadiness: Readonly<Record<string, ActionReadiness>> = {
  'ui.navigate': ({ context, args }) => {
    const payload = args as { path?: unknown } | null;

    return typeof payload?.path === 'string' && context.route === payload.path;
  },
  'ui.openDetails': ({ context, args }) => {
    const payload = args as { id?: unknown } | null;

    return typeof payload?.id === 'string' && context.route.endsWith('/' + payload.id);
  },
};
