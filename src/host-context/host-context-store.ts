import type { HostCapability, HostContext } from '@/contracts';

export type HostContextListener = (context: HostContext) => void;

export interface HostPageUpdateOptions {
  route: string;
  page: HostContext['page'];
  selection?: 'clear' | 'preserve';
  /** Omitted entities preserve the current summaries. */
  entities?: NonNullable<HostContext['entities']>;
}

type CapabilityResolver = (context: HostContext) => HostCapability[];

// Context is JSON protocol data; object key order and omitted optional fields are not changes.
const sameValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }

  const serialize = (value: unknown) =>
    JSON.stringify(value, (_key, entry) =>
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(
            Object.keys(entry)
              .sort()
              .map((key) => [key, entry[key]]),
          )
        : entry,
    );

  return serialize(left) === serialize(right);
};

export class HostContextManager {
  private disposed = false;

  private context: HostContext;

  private listeners = new Set<HostContextListener>();

  private capabilityResolver?: CapabilityResolver;

  private lastPage?: Omit<HostPageUpdateOptions, 'entities'>;

  private notifications: HostContext[] = [];

  private notifying = false;

  constructor(
    initial: Omit<HostContext, 'revision' | 'capabilities'> & { capabilities?: HostCapability[] },
  ) {
    this.context = structuredClone({
      ...initial,
      capabilities: initial.capabilities ?? [],
      revision: 0,
    });
  }

  getSnapshot(): HostContext {
    return structuredClone(this.context);
  }

  subscribe(listener: HostContextListener): () => void {
    if (this.disposed) {
      return () => {};
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The bridge derives available actions before a context update becomes observable. */
  setCapabilityResolver(resolver: CapabilityResolver): () => void {
    if (this.disposed) {
      return () => {};
    }

    this.capabilityResolver = resolver;

    return () => {
      if (this.capabilityResolver === resolver) {
        this.capabilityResolver = undefined;
      }
    };
  }

  private commit(partial: Partial<Omit<HostContext, 'revision'>>): void {
    if (
      this.disposed ||
      Object.entries(partial).every(([key, value]) =>
        sameValue(this.context[key as keyof HostContext], value),
      )
    ) {
      return;
    }

    const next = structuredClone({
      ...this.context,
      ...partial,
      revision: this.context.revision + 1,
    });

    if (this.capabilityResolver) {
      next.capabilities = structuredClone(this.capabilityResolver(structuredClone(next)));
    }

    if (
      Object.keys(next)
        .filter((key) => key !== 'revision')
        .every((key) =>
          sameValue(this.context[key as keyof HostContext], next[key as keyof HostContext]),
        )
    ) {
      return;
    }

    this.context = next;
    this.notifications.push(this.getSnapshot());

    if (this.notifying) {
      return;
    }

    this.notifying = true;

    try {
      while (this.notifications.length && !this.disposed) {
        const snapshot = this.notifications.shift()!;

        for (const listener of [...this.listeners]) {
          if (!this.disposed && this.listeners.has(listener)) {
            listener(structuredClone(snapshot));
          }
        }
      }
    } finally {
      this.notifying = false;
    }
  }

  /** One page update publishes at most one revision, including derived capabilities. */
  updatePage({ route, page, selection = 'clear', entities }: HostPageUpdateOptions): boolean {
    if (this.disposed) {
      return false;
    }

    const pageState = { route, page, selection };

    const pageChanged =
      !sameValue(this.lastPage, pageState) ||
      this.context.route !== route ||
      !sameValue(this.context.page, page);

    const previousPage = this.lastPage;
    const previousContext = this.context;
    const nextPage = structuredClone(pageState);

    this.lastPage = nextPage;

    try {
      this.commit({
        route,
        page,
        ...(pageChanged && selection === 'clear' ? { selection: undefined } : {}),
        ...(entities !== undefined ? { entities } : {}),
      });
    } catch (error) {
      if (this.context === previousContext && this.lastPage === nextPage) {
        this.lastPage = previousPage;
      }

      throw error;
    }

    return pageChanged;
  }

  setRoute(route: string, page: HostContext['page']): void {
    this.commit({ route, page });
  }

  setSelection(selection: HostContext['selection'] | undefined): void {
    this.commit({ selection });
  }

  setCapabilities(capabilities: HostCapability[]): void {
    this.commit({ capabilities });
  }

  setTargets(targets: NonNullable<HostContext['targets']>): void {
    this.commit({ targets });
  }

  setEntities(entities: NonNullable<HostContext['entities']>): void {
    this.commit({ entities });
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.notifications.length = 0;
    this.capabilityResolver = undefined;
    this.lastPage = undefined;
  }

  clearSelection(): void {
    this.commit({ selection: undefined });
  }
}
