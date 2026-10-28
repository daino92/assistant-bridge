import type {
  ActionLifecycleEvent,
  HostContext,
  HostActionRequest,
  HostActionResult,
  AssistantCommandRequest,
  AssistantCommandResult,
  StructuredError,
} from '@/contracts';

/** Fire-and-forget notifications */
export type IntegrationEventMap = {
  'host.ready': { appId: string };
  'assistant.ready': { assistantId: string };
  'host.context.changed': { context: HostContext };
  'host.entity.selected': {
    entityType: string;
    entityId: string;
    context: HostContext;
  };
  'assistant.unmounted': Record<string, never>;
  'assistant.error': { error: StructuredError };
  'action.lifecycle': ActionLifecycleEvent;
  'host.action.request': HostActionRequest;
  'host.action.result': HostActionResult;
  'assistant.command.request': AssistantCommandRequest;
  'assistant.command.result': AssistantCommandResult;
  'integration.timeline': IntegrationTimelineEntry;
};

export type IntegrationEventName = keyof IntegrationEventMap;

export interface IntegrationDiagnostic {
  code:
    | 'CONNECTION_TIMEOUT'
    | 'CONNECTION_FAILED'
    | 'IFRAME_HANDSHAKE_TIMEOUT'
    | 'IFRAME_HANDSHAKE_FAILED'
    | 'FEDERATION_RUNTIME_UNAVAILABLE'
    | 'FEDERATION_LOAD_FAILED'
    | 'FEDERATION_EXPORT_MISSING'
    | 'FEDERATION_RENDER_FAILED'
    | 'FEDERATION_ADAPTER_LOAD_FAILED'
    | 'FEDERATION_ADAPTER_TIMEOUT'
    | 'ACTION_FAILED'
    | 'COMMAND_FAILED';
  phase:
    | 'adapter-load'
    | 'remote-load'
    | 'handshake'
    | 'receiver-ready'
    | 'render'
    | 'action'
    | 'command';
  mode?: 'iframe' | 'federation' | 'embedded';
  message: string;
  errorCode?: string;
}

export interface IntegrationTimelineEntry {
  id: string;
  timestamp: number;
  direction: 'host-to-assistant' | 'assistant-to-host' | 'internal';
  kind: 'event' | 'command-request' | 'command-result';
  name: string;
  requestId?: string;
  actionExecutionId?: string;
  payloadSummary: string;
  result?: { success: boolean; errorCode?: string };
  durationMs?: number;
  diagnostic?: IntegrationDiagnostic;
}
