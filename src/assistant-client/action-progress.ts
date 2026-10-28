import type { ActionLifecycleEvent, ActionLifecycleStatus } from '@/contracts';

export interface ActionProgressEntry {
  id: string;
  status: ActionLifecycleStatus | 'stopped';
  sequence?: number;
  dispatched?: boolean;
  error?: string;
}

const TERMINAL_STATUSES = new Set<ActionProgressEntry['status']>([
  'succeeded',
  'failed',
  'rejected',
  'cancelled',
  'stopped',
]);

/** Correlates lifecycle updates while the consumer supplies presentation-only fields. */
export const reduceActionProgress = <T extends ActionProgressEntry>(
  entries: T[],
  event: ActionLifecycleEvent,
  presentation: Omit<T, keyof ActionProgressEntry>,
): T[] => {
  const previous = entries.find((entry) => entry.id === event.actionExecutionId);

  if (
    previous &&
    (TERMINAL_STATUSES.has(previous.status) ||
      (previous.sequence !== undefined && previous.sequence >= event.sequence))
  ) {
    return entries;
  }

  const next = {
    ...previous,
    ...presentation,
    id: event.actionExecutionId,
    status: event.status,
    sequence: event.sequence,
    dispatched: event.dispatched,
    error: event.error?.message,
  } as T;

  return previous
    ? entries.map((entry) => (entry.id === next.id ? next : entry))
    : [...entries, next];
};

/** Resolves unfinished progress after an interrupted run without rewriting terminal outcomes. */
export const finalizeActionProgress = <T extends ActionProgressEntry>(
  entries: T[],
  status: 'stopped' | 'failed',
): T[] => {
  if (entries.every((entry) => TERMINAL_STATUSES.has(entry.status))) {
    return entries;
  }

  return entries.map((entry) =>
    TERMINAL_STATUSES.has(entry.status) ? entry : { ...entry, status },
  );
};
