import { useEffect, useLayoutEffect, useRef } from 'react';

import {
  createHostIntegration,
  type CreateHostIntegrationOptions,
  type HostIntegration,
} from '@/create-host-integration';
import type { HostActionInput } from '@/actions';
import type { IntegrationTimelineEntry } from '@/contracts';

interface ManagedIntegration {
  integration: HostIntegration;
  actions: CreateHostIntegrationOptions['actions'];
  actionNames: Set<string>;
  lifecycle: {
    mounted: boolean;
    disposed: boolean;
    generation: number;
    timeline: IntegrationTimelineEntry[];
    onTimeline?: CreateHostIntegrationOptions['onTimeline'];
  };
}

const resolveActions = (
  actions: CreateHostIntegrationOptions['actions'],
  targets: HostIntegration['targetRegistry'],
): HostActionInput[] => (typeof actions === 'function' ? actions({ targets }) : actions);

/** Owns one integration for this mounted host. Bootstrap options are fixed for its lifetime. */
export const useHostIntegration = (options: CreateHostIntegrationOptions): HostIntegration => {
  const managedRef = useRef<ManagedIntegration | null>(null);

  if (!managedRef.current) {
    const lifecycle: ManagedIntegration['lifecycle'] = {
      mounted: false,
      disposed: false,
      generation: 0,
      timeline: [],
    };

    let initialActions: HostActionInput[] = [];

    const integration = createHostIntegration({
      ...options,
      actions: ({ targets }) => {
        initialActions = resolveActions(options.actions, targets);

        return initialActions;
      },
      onTimeline: (entry) => {
        if (lifecycle.disposed) {
          return;
        }

        if (lifecycle.mounted) {
          lifecycle.onTimeline?.(entry);
        } else {
          lifecycle.timeline.push(entry);
        }
      },
    });

    managedRef.current = {
      integration,
      lifecycle,
      actions: options.actions,
      actionNames: new Set(initialActions.map((action) => action.name)),
    };
  }

  const managed = managedRef.current;

  useLayoutEffect(() => {
    managed.lifecycle.onTimeline = options.onTimeline;
  }, [managed, options.onTimeline]);

  useLayoutEffect(() => {
    if (managed.actions === options.actions) {
      return;
    }

    const { integration } = managed;
    const actions = resolveActions(options.actions, integration.targetRegistry);
    const names = new Set<string>();

    for (const action of actions) {
      if (
        names.has(action.name) ||
        (integration.actionRegistry.hasAction(action.name) && !managed.actionNames.has(action.name))
      ) {
        throw new Error(`Action already registered: ${action.name}`);
      }

      names.add(action.name);
    }

    managed.actionNames.forEach((name) => integration.actionRegistry.unregister(name));

    for (const action of actions) {
      integration.actionRegistry.register({
        name: action.name,
        description: action.description,
        parametersSchema: action.schema,
        requiresConfirmation: action.requiresConfirmation ?? false,
        isAvailable: action.available,
        handler: action.handler,
      });
    }

    managed.actions = options.actions;
    managed.actionNames = names;

    if (
      JSON.stringify(integration.actionRegistry.getCapabilities()) !==
      JSON.stringify(integration.contextManager.getSnapshot().capabilities)
    ) {
      integration.bridge.syncCapabilities();
    }
  }, [managed, options.actions]);

  useEffect(() => {
    const { lifecycle, integration } = managed;

    lifecycle.mounted = true;
    lifecycle.generation += 1;
    lifecycle.timeline.splice(0).forEach((entry) => lifecycle.onTimeline?.(entry));

    return () => {
      lifecycle.mounted = false;

      const generation = ++lifecycle.generation;

      // Strict Mode replays setup immediately; only a final unmount disposes the instance.
      queueMicrotask(() => {
        if (lifecycle.mounted || lifecycle.generation !== generation) {
          return;
        }

        lifecycle.disposed = true;
        lifecycle.onTimeline = undefined;
        integration.dispose();
        lifecycle.timeline.length = 0;
      });
    };
  }, [managed]);

  return managed.integration;
};
