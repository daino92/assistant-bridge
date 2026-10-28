export type EventHandler<T> = (payload: T) => void;

type ListenerMap<Events extends Record<string, unknown>> = {
  [K in keyof Events]?: Set<EventHandler<Events[K]>>;
};

export class TypedEventBus<Events extends Record<string, unknown>> {
  private listeners: ListenerMap<Events> = {};

  private errorHandler?: (error: unknown, event: keyof Events) => void;

  setErrorHandler(handler: (error: unknown, event: keyof Events) => void): void {
    this.errorHandler = handler;
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners[event];

    if (!set) {
      return;
    }

    for (const handler of set) {
      try {
        handler(payload);
      } catch (error) {
        this.errorHandler?.(error, event);
      }
    }
  }

  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }

    this.listeners[event]!.add(handler);

    return () => {
      this.listeners[event]?.delete(handler);
    };
  }

  off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void {
    this.listeners[event]?.delete(handler);
  }

  clear(): void {
    this.listeners = {};
  }

  listenerCount<K extends keyof Events>(event: K): number {
    return this.listeners[event]?.size ?? 0;
  }
}
