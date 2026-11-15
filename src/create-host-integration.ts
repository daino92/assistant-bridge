import { createIntegrationError } from '@/errors';
import { HostActionRegistry } from '@/action-registry';
import type { HostActionInput } from '@/actions';
import {
  createAssistantBridgeClient,
  createHostAssistantCommands,
  type AssistantBridgeClient,
  type HostAssistantCommands,
} from '@/assistant-client';
import { HostBridge } from '@/bridge';
import { UiTargetRegistry } from '@/capabilities';
import {
  ERROR_CODES,
  type HostContext,
  type ActionLifecycleEvent,
  type IntegrationTimelineEntry,
} from '@/contracts';
import { HostContextManager, type HostPageUpdateOptions } from '@/host-context';

export type UpdatePageOptions = HostPageUpdateOptions;

export interface HostIntegrationApi {
  targets: UiTargetRegistry;
}

export interface CreateHostIntegrationOptions {
  initialRoute?: string;
  initialPage?: HostContext['page'];
  destinations?: HostContext['destinations'];
  actions: HostActionInput[] | ((host: HostIntegrationApi) => HostActionInput[]);
  onTimeline?: (entry: IntegrationTimelineEntry) => void;
  commandTimeoutMs?: number;
  actionTimeoutMs?: number;
}

/** What a host uses. The bridge, context store and action registry stay internal. */
export interface HostIntegration {
  /** Ends the integration: rejects pending requests and clears targets and actions. */
  dispose(): void;
  subscribeActionLifecycle(listener: (event: ActionLifecycleEvent) => void): () => void;
  /** Publishes the current route, page, selection, entities, destinations and principal. */
  updatePage(options: UpdatePageOptions): void;
  /**
   * Publishes the entity the user selected (also as a `host.entity.selected` event), or clears
   * the selection with `null`. It does not submit a prompt.
   */
  setSelection(selection: NonNullable<HostContext['selection']> | null): void;
  /** UI targets the assistant can highlight, scroll to and focus. */
  targetRegistry: UiTargetRegistry;
  /** Commands to the assistant: open, close, focus, prefill, submitPrompt, askAbout. */
  assistantCommands: HostAssistantCommands;
  /** The restricted client a same-window assistant receives. */
  assistantClient: AssistantBridgeClient;
}

/** SDK-internal parts of an integration created by {@link createHostIntegration}. */
export interface IntegrationInternals extends HostIntegration {
  bridge: HostBridge;
  contextManager: HostContextManager;
  actionRegistry: HostActionRegistry;
}

/**
 * Internal access for SDK modules (connections, React hooks). Only integrations created by
 * `createHostIntegration` have these parts.
 */
export const internalsOf = (integration: HostIntegration): IntegrationInternals => {
  const internals = integration as Partial<IntegrationInternals>;

  if (!internals.bridge || !internals.contextManager || !internals.actionRegistry) {
    throw new Error('Use an integration created by createHostIntegration');
  }

  return internals as IntegrationInternals;
};

/** {@link createHostIntegration} with its internal parts, for SDK modules and tests. */
export const createIntegration = (options: CreateHostIntegrationOptions): IntegrationInternals => {
  const contextManager = new HostContextManager({
    route: options.initialRoute ?? '/',
    page: options.initialPage ?? { title: 'Dashboard', type: 'dashboard' },
    destinations: options.destinations,
  });

  const actionRegistry = new HostActionRegistry();
  const targetRegistry = new UiTargetRegistry();

  const unsubscribeTargets = targetRegistry.subscribe(() =>
    contextManager.setTargets(targetRegistry.describe()),
  );

  const bridge = new HostBridge({
    contextManager,
    actionRegistry,
    onTimeline: options.onTimeline,
    commandTimeoutMs: options.commandTimeoutMs,
    actionTimeoutMs: options.actionTimeoutMs,
  });

  const provided =
    typeof options.actions === 'function'
      ? options.actions({ targets: targetRegistry })
      : options.actions;

  for (const action of provided) {
    actionRegistry.register({
      name: action.name,
      description: action.description,
      parametersSchema: action.schema,
      requiresConfirmation: action.requiresConfirmation ?? false,
      isAvailable: action.available,
      exposeErrorMessages: action.exposeErrorMessages,
      handler: action.handler,
    });
  }

  bridge.initialize();

  let disposed = false;

  const integration: IntegrationInternals = {
    subscribeActionLifecycle: (listener) =>
      bridge.signal.aborted ? () => {} : bridge.bus.on('action.lifecycle', listener),
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      unsubscribeTargets();

      try {
        bridge.destroy();
      } finally {
        try {
          targetRegistry.dispose();
        } finally {
          contextManager.dispose();
          actionRegistry.clear();
        }
      }
    },
    updatePage: (pageOptions) => {
      if (disposed || bridge.signal.aborted) {
        throw createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE);
      }

      if (contextManager.updatePage(pageOptions)) {
        targetRegistry.clearAllHighlights();
      }
    },
    setSelection: (selection) => {
      if (disposed || bridge.signal.aborted) {
        throw createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE);
      }

      if (selection) {
        bridge.publishEntitySelected(selection.type, selection.id);
      } else {
        contextManager.clearSelection();
      }
    },
    bridge,
    contextManager,
    actionRegistry,
    targetRegistry,
    assistantCommands: createHostAssistantCommands(bridge),
    assistantClient: createAssistantBridgeClient(bridge),
  };

  return integration;
};

/** Creates the host side of the integration. Call `dispose()` when the host unmounts. */
export const createHostIntegration = (options: CreateHostIntegrationOptions): HostIntegration =>
  createIntegration(options);
