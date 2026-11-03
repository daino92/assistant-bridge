import { useEffect, useRef, useState, type RefObject } from 'react';

import { useIntegration } from '@/react/context';

export interface UiTargetOptions {
  label?: string;
  description?: string;
  focusRef?: RefObject<HTMLElement | null>;
  onSetValue?: (value: string) => void;
  onSetChecked?: (checked: boolean) => void;
  onSetExpanded?: (expanded: boolean) => void;
  onActivateTab?: () => void;
  onSelect?: (value?: string) => void | Promise<void>;
}

/** Registers host-owned DOM behavior; the host chooses how highlights are styled. */
export const useUiTarget = <T extends HTMLElement = HTMLElement>(
  id: string,
  {
    focusRef,
    onSetValue,
    onSetChecked,
    onSetExpanded,
    onActivateTab,
    onSelect,
    label,
    description,
  }: UiTargetOptions = {},
): { highlighted: boolean; ref: RefObject<T | null> } => {
  const { targetRegistry } = useIntegration();
  const ref = useRef<T | null>(null);
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    const element = focusRef?.current ?? ref.current;

    if (!element) {
      return;
    }

    const focusable = Boolean(focusRef) || element.tabIndex >= 0 || element.isContentEditable;

    return targetRegistry.register({
      id,
      label,
      description,
      highlight: () => setHighlighted(true),
      clearHighlight: () => setHighlighted(false),
      scrollIntoView: (behavior) => {
        (focusRef?.current ?? ref.current)?.scrollIntoView({ behavior, block: 'center' });
      },
      ...(focusable
        ? {
            focus: () => {
              (focusRef?.current ?? ref.current)?.focus();
            },
          }
        : {}),
      ...(onSetValue ? { setValue: onSetValue } : {}),
      ...(onSetChecked ? { setChecked: onSetChecked } : {}),
      ...(onSetExpanded ? { setExpanded: onSetExpanded } : {}),
      ...(onActivateTab ? { activateTab: onActivateTab } : {}),
      ...(onSelect ? { select: (value?: string) => onSelect(value) } : {}),
    });
  }, [
    id,
    targetRegistry,
    focusRef,
    onSetValue,
    onSetChecked,
    onSetExpanded,
    onActivateTab,
    onSelect,
    label,
    description,
  ]);

  return { highlighted, ref };
};
