import { AbstractAgent } from '@ag-ui/client';
import { EventType, type BaseEvent, type RunAgentInput, type ToolMessage } from '@ag-ui/core';
import { EventSchemas } from '@ag-ui/core/schemas';
import { Observable } from 'rxjs';

import {
  createRunError,
  normalizeRunError,
  RUN_ERROR_CODES,
  type WebSocketAgentOptions,
  type HostAgentState,
} from '@/ag-ui';
import { connectWebSocket } from './agent-transport.js';
import { connectStomp } from './stomp-transport.js';
import { agentControlSchema, type AgentControl } from './protocol.js';

/** Transport binding only; AbstractAgent owns event verification and message/state reduction. */
export class WebSocketAgent extends AbstractAgent {
  private readonly options: WebSocketAgentOptions;

  private sendFrame?: (value: AgentControl) => void;

  private cancel?: () => void;

  constructor(options: WebSocketAgentOptions) {
    super({
      threadId: options.input.threadId,
      initialMessages: options.input.messages,
      initialState: options.input.state,
    });
    this.options = options;
  }

  override abortRun = () => this.cancel?.();

  sendToolResult = (runId: string, message: ToolMessage, hostState?: HostAgentState) => {
    this.sendFrame?.({ type: 'tool_result', runId, message, ...(hostState ? { hostState } : {}) });
  };

  override run = (input: RunAgentInput): Observable<BaseEvent> =>
    new Observable((subscriber) => {
      const { signal } = this.options;

      signal.throwIfAborted();

      let terminal = false;

      const send = (value: AgentControl) => {
        if (!subscriber.closed) {
          try {
            transport.send(agentControlSchema.parse(value));
          } catch {
            subscriber.error(createRunError(RUN_ERROR_CODES.INVALID_REQUEST));
          }
        }
      };

      const abort = () => {
        send({ type: 'stop', runId: input.runId });
        subscriber.error(signal.reason ?? new DOMException('Stopped', 'AbortError'));
      };

      const timer = setTimeout(
        () => subscriber.error(createRunError(RUN_ERROR_CODES.TIMEOUT)),
        this.options.timeoutMs ?? 120_000,
      );

      this.sendFrame = send;
      this.cancel = abort;
      signal.addEventListener('abort', abort, { once: true });

      const connect: typeof connectWebSocket =
        this.options.transport === 'stomp'
          ? (url, callbacks) => connectStomp(url, callbacks, this.options.stompDestinations)
          : connectWebSocket;

      const transport = connect(this.options.url, {
        open: () => send({ type: 'run', input }),
        error: (error) => subscriber.error(error),
        closed: () => {
          if (!terminal) {
            subscriber.error(createRunError(RUN_ERROR_CODES.CONNECTION_CLOSED));
          }
        },
        message: (body) => {
          try {
            const value = EventSchemas.parse(JSON.parse(body));

            if (
              (value.type === EventType.RUN_STARTED || value.type === EventType.RUN_FINISHED) &&
              (value.runId !== input.runId || value.threadId !== input.threadId)
            ) {
              throw createRunError(RUN_ERROR_CODES.PROTOCOL_ERROR);
            }

            terminal = value.type === EventType.RUN_FINISHED || value.type === EventType.RUN_ERROR;
            subscriber.next(
              value.type === EventType.RUN_ERROR
                ? { ...value, ...normalizeRunError(value) }
                : value,
            );

            if (terminal) {
              subscriber.complete();
            }
          } catch {
            subscriber.error(createRunError(RUN_ERROR_CODES.PROTOCOL_ERROR));
          }
        },
      });

      return () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        this.sendFrame = undefined;
        this.cancel = undefined;
        transport.close();
      };
    });
}
