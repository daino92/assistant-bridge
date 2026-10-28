import { expect, it } from 'vitest';

import {
  finalizeActionProgress,
  reduceActionProgress,
  type ActionProgressEntry,
} from '@/assistant-client';
import type { ActionLifecycleEvent } from '@/contracts';

interface Entry extends ActionProgressEntry {
  label: string;
}

const EVENT: ActionLifecycleEvent = {
  actionExecutionId: crypto.randomUUID(),
  action: 'test',
  status: 'requested',
  sequence: 0,
  dispatched: false,
  timestamp: 1,
};

it('correlates by execution ID, preserves order and uses canonical fields without mutating inputs', () => {
  const initial: Entry[] = [];
  const first = reduceActionProgress(initial, EVENT, { label: 'First' });
  const other = { ...EVENT, actionExecutionId: crypto.randomUUID() };
  const second = reduceActionProgress(first, other, { label: 'Second' });

  const updated = reduceActionProgress(
    second,
    { ...EVENT, status: 'running', sequence: 1, dispatched: true },
    { label: 'Updated' },
  );

  expect(initial).toEqual([]);
  expect(first[0].status).toBe('requested');
  expect(second[0].label).toBe('First');
  expect(updated.map((entry) => entry.label)).toEqual(['Updated', 'Second']);
  expect(updated[0]).toMatchObject({
    id: EVENT.actionExecutionId,
    status: 'running',
    dispatched: true,
    sequence: 1,
  });
  expect(updated[1]).toBe(second[1]);
});

it('ignores duplicate, older and post-terminal updates', () => {
  const running = reduceActionProgress<Entry>(
    [],
    { ...EVENT, status: 'running', sequence: 2 },
    { label: 'Running' },
  );

  expect(reduceActionProgress(running, { ...EVENT, sequence: 1 }, { label: 'Old' })).toBe(running);
  expect(reduceActionProgress(running, { ...EVENT, sequence: 2 }, { label: 'Duplicate' })).toBe(
    running,
  );

  const done = reduceActionProgress(
    running,
    { ...EVENT, status: 'succeeded', sequence: 3 },
    { label: 'Done' },
  );

  expect(
    reduceActionProgress(done, { ...EVENT, status: 'running', sequence: 4 }, { label: 'Late' }),
  ).toBe(done);
});

it('retains terminal outcomes and dispatch uncertainty when a run stops or fails', () => {
  const entries: Entry[] = [
    { id: 'one', label: 'Pending', status: 'awaiting-approval', dispatched: false },
    { id: 'two', label: 'Running', status: 'running', dispatched: true },
    { id: 'three', label: 'Done', status: 'succeeded' },
    { id: 'four', label: 'Cancelled', status: 'cancelled', dispatched: true },
  ];

  const stopped = finalizeActionProgress(entries, 'stopped');

  expect(stopped.map((entry) => entry.status)).toEqual([
    'stopped',
    'stopped',
    'succeeded',
    'cancelled',
  ]);
  expect(stopped[1].dispatched).toBe(true);
  expect(stopped[2]).toBe(entries[2]);
  expect(entries[0].status).toBe('awaiting-approval');
  expect(finalizeActionProgress(stopped, 'failed')).toBe(stopped);
  expect(finalizeActionProgress(entries, 'failed')[0].status).toBe('failed');
});
