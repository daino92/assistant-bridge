import {
  focusAction,
  highlightAction,
  navigateAction,
  openDetailsAction,
  scrollToAction,
  selectAction,
  type HostActionInput,
} from '@/actions';
import type { UiTargetRegistry } from '@/capabilities';

export type UiTargetActionName = 'highlight' | 'scrollTo' | 'focus' | 'select';

export interface CreateUiActionsOptions {
  navigation?: Parameters<typeof navigateAction>[0];
  targets?: {
    registry: UiTargetRegistry;
    enable: readonly UiTargetActionName[];
  };
  details?: {
    open: Parameters<typeof openDetailsAction>[0]['openDetails'];
  };
}

/** Returns definitions only; omitted groups enable no actions. */
export const createUiActions = (options: CreateUiActionsOptions = {}): HostActionInput[] => {
  const actions: HostActionInput[] = [];

  if (options.navigation) {
    actions.push(navigateAction(options.navigation));
  }

  if (options.targets) {
    const targetActionFactories = {
      highlight: highlightAction,
      scrollTo: scrollToAction,
      focus: focusAction,
      select: selectAction,
    };

    for (const name of new Set(options.targets.enable)) {
      actions.push(targetActionFactories[name](options.targets.registry));
    }
  }

  if (options.details) {
    actions.push(openDetailsAction({ openDetails: options.details.open }));
  }

  return actions;
};
