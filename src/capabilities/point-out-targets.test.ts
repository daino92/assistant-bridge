import { afterEach, expect, it, vi } from 'vitest';

import { pointOutTargets, UiTargetRegistry } from '@/capabilities';

afterEach(() => {
  vi.useRealTimers();
});

const target = (registry: UiTargetRegistry, id: string) => {
  const calls = { highlight: vi.fn(), clear: vi.fn(), scroll: vi.fn() };

  registry.register({
    id,
    label: id,
    highlight: calls.highlight,
    clearHighlight: calls.clear,
    scrollIntoView: calls.scroll,
  });

  return calls;
};

it('highlights the first registered target of each group and scrolls only the first', () => {
  vi.useFakeTimers();

  const registry = new UiTargetRegistry();
  const save = target(registry, 'models.save');
  const nav = target(registry, 'nav.models');

  expect(
    pointOutTargets(registry, [['models.missing', 'models.save'], ['nav.models'], ['absent']], {
      durationMs: 1000,
    }),
  ).toEqual(['models.save', 'nav.models']);
  expect(save.scroll).toHaveBeenCalledOnce();
  expect(nav.scroll).not.toHaveBeenCalled();
  expect(save.highlight).toHaveBeenCalledOnce();
  expect(nav.highlight).toHaveBeenCalledOnce();

  vi.advanceTimersByTime(1000);
  expect(save.clear).toHaveBeenCalled();
  expect(pointOutTargets(null, [['models.save']])).toEqual([]);
  registry.dispose();
});

it('can skip scrolling', () => {
  const registry = new UiTargetRegistry();
  const save = target(registry, 'models.save');

  pointOutTargets(registry, [['models.save']], { scroll: false });
  expect(save.scroll).not.toHaveBeenCalled();
  registry.dispose();
});
