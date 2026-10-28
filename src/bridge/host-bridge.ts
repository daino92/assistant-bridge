import { createIntegrationError, normalizeIntegrationError } from '@/errors';
import type { HostActionRegistry } from '@/action-registry';
import {
  actionLifecycleEventSchema,
  type ActionLifecycleEvent,
  type ActionLifecycleStatus,
  type HostContext,
  ERROR_CODES,
  PROTOCOL_VERSION,
  assistantCommandRequestSchema,
  hostActionRequestSchema,
  hostActionResultSchema,
  type AssistantCommandRequest,
  type AssistantCommandResult,
  type HostActionRequest,
  type HostActionResult,
  type IntegrationEventMap,
  type IntegrationDiagnostic,
} from '@/contracts';
import type { HostContextManager } from '@/host-context';
import { RequestResponseChannel } from './request-response';
import { TypedEventBus } from './typed-event-bus';

export interface HostBridgeOptions {
  appId: string;
  contextManager: HostContextManager;
  actionRegistry: HostActionRegistry;
  commandTimeoutMs?: number;
  actionTimeoutMs?: number;
  onTimeline?: (entry: IntegrationEventMap['integration.timeline']) => void;
}

const ACTION_TRANSITIONS: Record<ActionLifecycleStatus, readonly ActionLifecycleStatus[]> = {
  requested: ['awaiting-approval', 'running', 'failed', 'cancelled'],
  'awaiting-approval': ['running', 'failed', 'rejected', 'cancelled'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  rejected: [],
  cancelled: [],
};

export class HostBridge {
  private readonly lifetime = new AbortController();

  readonly signal = this.lifetime.signal;

  private readonly actionLifecycles = new Map<string, ActionLifecycleEvent>();

  readonly bus = new TypedEventBus<IntegrationEventMap>();

  private contextManager: HostContextManager;

  private actionRegistry: HostActionRegistry;

  private assistantAvailable = false;

  private unsubscribers: Array<() => void> = [];

  private actionChannel: RequestResponseChannel<
    IntegrationEventMap,
    'host.action.request',
    'host.action.result'
  >;

  private commandChannel: RequestResponseChannel<
    IntegrationEventMap,
    'assistant.command.request',
    'assistant.command.result'
  >;

  private commandTimeoutMs: number;

  private actionTimeoutMs: number;

  private onTimeline?: HostBridgeOptions['onTimeline'];

  constructor(options: HostBridgeOptions) {
    this.contextManager = options.contextManager;
    this.actionRegistry = options.actionRegistry;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 10_000;
    this.actionTimeoutMs = options.actionTimeoutMs ?? 10_000;
    this.onTimeline = options.onTimeline;

    this.actionChannel = new RequestResponseChannel({
      bus: this.bus,
      requestEvent: 'host.action.request',
      resultEvent: 'host.action.result',
      defaultTimeoutMs: this.actionTimeoutMs,
      extractRequestId: (r) => (r as HostActionRequest).requestId,
      extractResult: (r) => {
        const result = r as HostActionResult;

        return {
          requestId: result.requestId,
          success: result.success,
          data: result.data,
          error: result.error as
            { code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES]; message: string } | undefined,
        };
      },
    });

    this.commandChannel = new RequestResponseChannel({
      bus: this.bus,
      requestEvent: 'assistant.command.request',
      resultEvent: 'assistant.command.result',
      defaultTimeoutMs: this.commandTimeoutMs,
      extractRequestId: (r) => (r as AssistantCommandRequest).requestId,
      extractResult: (r) => {
        const result = r as AssistantCommandResult;

        return {
          requestId: result.requestId,
          success: result.success,
          data: result.data,
          error: result.error as
            { code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES]; message: string } | undefined,
        };
      },
    });

    this.setupHostSide();
  }

  private recordTimeline(
    entry: Omit<IntegrationEventMap['integration.timeline'], 'id' | 'timestamp'>,
  ): void {
    if (this.signal.aborted) {
      return;
    }

    const full: IntegrationEventMap['integration.timeline'] = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    this.onTimeline?.(full);
    this.bus.emit('integration.timeline', full);
  }

  reportDiagnostic(diagnostic: IntegrationDiagnostic, requestId?: string): void {
    this.recordTimeline({
      direction: 'internal',
      kind: 'event',
      name: diagnostic.code,
      requestId,
      payloadSummary: diagnostic.message,
      result: { success: false, errorCode: diagnostic.errorCode ?? diagnostic.code },
      diagnostic,
    });
  }

  /** Telemetry from the trusted assistant, not authorization or proof of a business mutation. */
  publishActionLifecycle(value: ActionLifecycleEvent): void {
    if (this.signal.aborted) {
      return;
    }

    const parsed = actionLifecycleEventSchema.safeParse(value);

    if (!parsed.success) {
      return;
    }

    const event = parsed.data;
    const previous = this.actionLifecycles.get(event.actionExecutionId);

    if (
      previous
        ? previous.action !== event.action ||
          previous.toolCallId !== event.toolCallId ||
          event.sequence !== previous.sequence + 1 ||
          !ACTION_TRANSITIONS[previous.status].includes(event.status) ||
          (previous.dispatched && !event.dispatched)
        : event.status !== 'requested' || event.sequence !== 0 || event.dispatched
    ) {
      return;
    }

    if (event.error) {
      event.error = normalizeIntegrationError(event.error);
    }

    this.actionLifecycles.set(event.actionExecutionId, structuredClone(event));

    // Bound telemetry retention; observers own any long-lived history.
    if (this.actionLifecycles.size > 256) {
      this.actionLifecycles.delete(this.actionLifecycles.keys().next().value!);
    }

    this.bus.emit('action.lifecycle', event);
    this.recordTimeline({
      direction: 'assistant-to-host',
      kind: 'event',
      name: `action.${event.status}`,
      actionExecutionId: event.actionExecutionId,
      payloadSummary: event.action,
    });
  }

  private setupHostSide(): void {
    this.unsubscribers.push(
      this.bus.on('host.action.request', async (request) => {
        const start = Date.now();

        this.recordTimeline({
          direction: 'assistant-to-host',
          kind: 'command-request',
          name: request.action,
          requestId: request.requestId,
          actionExecutionId: request.actionExecutionId,
          payloadSummary: 'Payload omitted',
        });

        const parsed = hostActionRequestSchema.safeParse(request);

        if (!parsed.success) {
          this.emitActionResult({
            requestId: request.requestId,
            success: false,
            error: normalizeIntegrationError({ code: ERROR_CODES.INVALID_PAYLOAD }),
          });

          return;
        }

        const result = await this.actionRegistry.execute(parsed.data.action, parsed.data.payload, {
          getContext: () => this.contextManager.getSnapshot(),
          minContextRevision: parsed.data.contextRevision,
          confirmed: parsed.data.confirmed,
        });

        this.emitActionResult({
          requestId: parsed.data.requestId,
          success: result.success,
          data: result.success ? result.data : undefined,
          error: result.success ? undefined : result.error,
        });

        this.recordTimeline({
          direction: 'assistant-to-host',
          kind: 'command-result',
          name: parsed.data.action,
          requestId: parsed.data.requestId,
          actionExecutionId: parsed.data.actionExecutionId,
          payloadSummary: result.success ? 'OK' : 'Action failed',
          result: {
            success: result.success,
            errorCode: result.success ? undefined : result.error?.code,
          },
          durationMs: Date.now() - start,
        });
      }),
    );

    this.unsubscribers.push(
      this.contextManager.setCapabilityResolver((context) =>
        this.actionRegistry.getCapabilities(context),
      ),
      this.contextManager.subscribe((context) => this.publishContext(context)),
    );
  }

  private publishContext(context: HostContext): void {
    this.bus.emit('host.context.changed', { context });
    this.recordTimeline({
      direction: 'internal',
      kind: 'event',
      name: 'host.context.changed',
      payloadSummary: `route=${context.route} rev=${context.revision}`,
    });
  }

  private emitActionResult(partial: Omit<HostActionResult, 'protocolVersion'>): void {
    const result: HostActionResult = {
      protocolVersion: PROTOCOL_VERSION,
      ...partial,
    };

    hostActionResultSchema.parse(result);

    if (!result.success) {
      this.reportDiagnostic(
        {
          code: 'ACTION_FAILED',
          phase: 'action',
          message: 'Host action failed.',
          errorCode: result.error?.code,
        },
        result.requestId,
      );
    }

    this.bus.emit('host.action.result', result);
  }

  initialize(): void {
    this.bus.emit('host.ready', { appId: this.contextManager.getSnapshot().appId });

    const revision = this.contextManager.getSnapshot().revision;

    this.syncCapabilities();

    if (this.contextManager.getSnapshot().revision === revision) {
      this.publishContext(this.contextManager.getSnapshot());
    }
  }

  syncCapabilities(): void {
    const caps = this.actionRegistry.getCapabilities(this.contextManager.getSnapshot());

    this.contextManager.setCapabilities(caps);
  }

  setAssistantAvailable(available: boolean): void {
    this.assistantAvailable = available;

    if (!available) {
      this.commandChannel.rejectAll({
        code: ERROR_CODES.RECEIVER_UNAVAILABLE,
        message: 'Assistant is unavailable',
      });
    }
  }

  isAssistantAvailable(): boolean {
    return this.assistantAvailable;
  }

  notifyAssistantReady(assistantId: string): void {
    this.assistantAvailable = true;
    this.bus.emit('assistant.ready', { assistantId });
    this.recordTimeline({
      direction: 'internal',
      kind: 'event',
      name: 'assistant.ready',
      payloadSummary: assistantId,
    });
  }

  notifyAssistantUnmounted(): void {
    this.assistantAvailable = false;
    this.bus.emit('assistant.unmounted', {});
    this.commandChannel.rejectAll({
      code: ERROR_CODES.RECEIVER_UNAVAILABLE,
      message: 'Assistant unmounted',
    });
  }

  publishEntitySelected(entityType: string, entityId: string): void {
    this.contextManager.setSelection({ type: entityType, id: entityId });
    this.bus.emit('host.entity.selected', {
      entityType,
      entityId,
      context: this.contextManager.getSnapshot(),
    });
    this.recordTimeline({
      direction: 'host-to-assistant',
      kind: 'event',
      name: 'host.entity.selected',
      payloadSummary: `${entityType}:${entityId}`,
    });
  }

  getContextSnapshot(): HostContextManager['getSnapshot'] {
    return () => this.contextManager.getSnapshot();
  }

  /** Host → Assistant: request a command through the bus */
  async sendAssistantCommand(command: string, payload: unknown): Promise<unknown> {
    const requestId = crypto.randomUUID();

    if (!this.assistantAvailable) {
      this.reportDiagnostic(
        {
          code: 'COMMAND_FAILED',
          phase: 'command',
          message: 'Assistant command receiver is unavailable.',
          errorCode: ERROR_CODES.RECEIVER_UNAVAILABLE,
        },
        requestId,
      );

      throw normalizeIntegrationError({ code: ERROR_CODES.RECEIVER_UNAVAILABLE });
    }

    const request: AssistantCommandRequest = {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      command,
      payload,
    };

    assistantCommandRequestSchema.parse(request);

    const start = Date.now();

    this.recordTimeline({
      direction: 'host-to-assistant',
      kind: 'command-request',
      name: command,
      requestId,
      payloadSummary: 'Payload omitted',
    });

    try {
      const data = await this.commandChannel.request(request, this.commandTimeoutMs);

      this.recordTimeline({
        direction: 'host-to-assistant',
        kind: 'command-result',
        name: command,
        requestId,
        payloadSummary: 'OK',
        result: { success: true },
        durationMs: Date.now() - start,
      });

      return data;
    } catch (error) {
      const err = error as { code?: string; message?: string };

      this.reportDiagnostic(
        {
          code: 'COMMAND_FAILED',
          phase: 'command',
          message: 'Assistant command failed.',
          errorCode: err.code,
        },
        requestId,
      );

      this.recordTimeline({
        direction: 'host-to-assistant',
        kind: 'command-result',
        name: command,
        requestId,
        payloadSummary: 'Command failed',
        result: { success: false, errorCode: err.code },
        durationMs: Date.now() - start,
      });

      throw error;
    }
  }

  /** Assistant → Host: request an action through the bridge. */
  async requestHostAction(
    action: string,
    payload: unknown,
    contextRevision?: number,
    confirmed?: boolean,
    actionExecutionId?: string,
  ): Promise<unknown> {
    const requestId = crypto.randomUUID();

    const request: HostActionRequest = {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      action,
      payload,
      contextRevision,
      ...(confirmed ? { confirmed: true } : {}),
      ...(actionExecutionId ? { actionExecutionId } : {}),
    };

    hostActionRequestSchema.parse(request);

    const start = Date.now();

    this.recordTimeline({
      direction: 'assistant-to-host',
      kind: 'command-request',
      name: action,
      actionExecutionId,
      requestId,
      payloadSummary: 'Payload omitted',
    });

    const data = await this.requestActionResponse(request);

    this.recordTimeline({
      direction: 'assistant-to-host',
      kind: 'command-result',
      name: action,
      actionExecutionId,
      requestId,
      payloadSummary: 'OK',
      result: { success: true },
      durationMs: Date.now() - start,
    });

    return data;
  }

  /** Emit an action request on the bus (same path as assistant) */
  requestHostActionViaBus(
    action: string,
    payload: unknown,
    contextRevision?: number,
  ): Promise<unknown> {
    const requestId = crypto.randomUUID();

    const request: HostActionRequest = {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      action,
      payload,
      contextRevision,
    };

    return this.requestActionResponse(request);
  }

  private async requestActionResponse(request: HostActionRequest): Promise<unknown> {
    try {
      return await this.actionChannel.request(request, this.actionTimeoutMs);
    } catch (error) {
      if ((error as { code?: string })?.code === ERROR_CODES.TIMEOUT) {
        this.reportDiagnostic(
          {
            code: 'ACTION_FAILED',
            phase: 'action',
            message: 'Host action request timed out.',
            errorCode: ERROR_CODES.TIMEOUT,
          },
          request.requestId,
        );
      }

      throw error;
    }
  }

  destroy(): void {
    if (this.signal.aborted) {
      return;
    }

    this.assistantAvailable = false;
    this.lifetime.abort(createIntegrationError(ERROR_CODES.RECEIVER_UNAVAILABLE));
    this.onTimeline = undefined;

    for (const unsub of this.unsubscribers.splice(0)) {
      unsub();
    }

    this.actionChannel.destroy();
    this.commandChannel.destroy();
    this.bus.clear();
    this.actionLifecycles.clear();
  }
}
