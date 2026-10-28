import { normalizeIntegrationError } from '@/errors';
import { ERROR_CODES, type StructuredError } from '@/contracts';
import type { TypedEventBus } from '@/bridge';

export interface PendingRequest {
  requestId: string;
  resolve: (value: unknown) => void;
  reject: (error: StructuredError) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  settled: boolean;
}

export interface RequestResponseConfig<
  Events extends Record<string, unknown>,
  RequestEvent extends keyof Events,
  ResultEvent extends keyof Events,
> {
  bus: TypedEventBus<Events>;
  requestEvent: RequestEvent;
  resultEvent: ResultEvent;
  extractRequestId: (request: Events[RequestEvent]) => string;
  extractResult: (result: Events[ResultEvent]) => {
    requestId: string;
    success: boolean;
    data?: unknown;
    error?: StructuredError;
  };
  defaultTimeoutMs: number;
}

export class RequestResponseChannel<
  Events extends Record<string, unknown>,
  RequestEvent extends keyof Events,
  ResultEvent extends keyof Events,
> {
  private disposed = false;

  private pending = new Map<string, PendingRequest>();

  private unsubResult?: () => void;

  constructor(private config: RequestResponseConfig<Events, RequestEvent, ResultEvent>) {
    this.unsubResult = config.bus.on(config.resultEvent, (result) => {
      const parsed = config.extractResult(result);
      const entry = this.pending.get(parsed.requestId);

      if (!entry || entry.settled) {
        return;
      }

      entry.settled = true;
      clearTimeout(entry.timeoutId);
      this.pending.delete(parsed.requestId);

      if (parsed.success) {
        entry.resolve(parsed.data);
      } else {
        entry.reject(normalizeIntegrationError(parsed.error));
      }
    });
  }

  request(payload: Events[RequestEvent], timeoutMs?: number): Promise<unknown> {
    const requestId = this.config.extractRequestId(payload);
    const timeout = timeoutMs ?? this.config.defaultTimeoutMs;

    return new Promise((resolve, reject) => {
      if (this.disposed) {
        reject(normalizeIntegrationError({ code: ERROR_CODES.RECEIVER_UNAVAILABLE }));

        return;
      }

      if (this.pending.has(requestId)) {
        reject(normalizeIntegrationError({ code: ERROR_CODES.EXECUTION_FAILED }));

        return;
      }

      const timeoutId = setTimeout(() => {
        const entry = this.pending.get(requestId);

        if (!entry || entry.settled) {
          return;
        }

        entry.settled = true;
        this.pending.delete(requestId);
        reject(normalizeIntegrationError({ code: ERROR_CODES.TIMEOUT }));
      }, timeout);

      this.pending.set(requestId, {
        requestId,
        resolve,
        reject,
        timeoutId,
        settled: false,
      });

      this.config.bus.emit(this.config.requestEvent, payload);
    });
  }

  settleResult(
    requestId: string,
    result: { success: boolean; data?: unknown; error?: StructuredError },
  ): boolean {
    const entry = this.pending.get(requestId);

    if (!entry || entry.settled) {
      return false;
    }

    entry.settled = true;
    clearTimeout(entry.timeoutId);
    this.pending.delete(requestId);

    if (result.success) {
      entry.resolve(result.data);
    } else {
      entry.reject(normalizeIntegrationError(result.error));
    }

    return true;
  }

  rejectAll(error: StructuredError): void {
    for (const entry of this.pending.values()) {
      if (entry.settled) {
        continue;
      }

      entry.settled = true;
      clearTimeout(entry.timeoutId);
      entry.reject(normalizeIntegrationError(error));
    }

    this.pending.clear();
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  destroy(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.rejectAll({
      code: ERROR_CODES.RECEIVER_UNAVAILABLE,
      message: 'Channel destroyed',
    });
    this.unsubResult?.();
  }
}
