import type { UiTargetRegistry } from './ui-target-registry';

export interface PointOutTargetsOptions {
  /** How long each target stays highlighted. Default 4000 ms. */
  durationMs?: number;
  /** Scroll behavior for the first target found. Default `smooth`; `false` skips scrolling. */
  scroll?: ScrollBehavior | false;
}

/**
 * Points out the first registered target of each group, for example the control that performs
 * an action and, as a fallback, the menu entry leading to it. Scrolls only the first target found
 * into view and highlights all of them. Missing targets are skipped. Returns the ids shown.
 */
export const pointOutTargets = (
  registry: UiTargetRegistry | null | undefined,
  groups: readonly (readonly string[])[],
  { durationMs = 4000, scroll = 'smooth' }: PointOutTargetsOptions = {},
): string[] => {
  const shown: string[] = [];

  if (!registry) {
    return shown;
  }

  for (const group of groups) {
    const id = group.find((candidate) => registry.has(candidate));

    if (!id) {
      continue;
    }

    if (!shown.length && scroll !== false) {
      registry.scrollTo(id, scroll);
    }

    registry.highlight(id, durationMs);
    shown.push(id);
  }

  return shown;
};
