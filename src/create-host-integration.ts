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
import { connectHostIframe, type HostIframeConnectionOptions } from '@/connections';

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

export interface HostIntegration {
  dispose(): void;
  subscribeActionLifecycle(listener: (event: ActionLifecycleEvent) => void): () => void;
  updatePage(options: UpdatePageOptions): void;
  connectIframe(options: HostIframeConnectionOptions): () => void;
  bridge: HostBridge;
  contextManager: HostContextManager;
  actionRegistry: HostActionRegistry;
  targetRegistry: UiTargetRegistry;
  assistantCommands: HostAssistantCommands;
  assistantClient: AssistantBridgeClient;
}

export const createHostIntegration = (options: CreateHostIntegrationOptions): HostIntegration => {
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
      handler: action.handler,
    });
  }

  bridge.initialize();

  let disposed = false;

  const integration: HostIntegration = {
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
    connectIframe: (connectionOptions) => connectHostIframe(integration, connectionOptions),
    bridge,
    contextManager,
    actionRegistry,
    targetRegistry,
    assistantCommands: createHostAssistantCommands(bridge),
    assistantClient: createAssistantBridgeClient(bridge),
  };

  return integration;
};
