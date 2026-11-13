import { useEffect, useRef, useState, type RefObject } from 'react';

import { useOptionalIntegration } from '@/react/context';

/** Attribute set on a target element while it is highlighted; style it, or use `AssistantHost` `highlight`. */
export const HIGHLIGHT_ATTRIBUTE = 'data-assistant-highlight';

export interface UiTargetOptions {
  label?: string;
  description?: string;
  focusRef?: RefObject<HTMLElement | null>;
  onSetValue?: (value: string) => void;
  onSetChecked?: (checked: boolean) => void;
  onSetExpanded?: (expanded: boolean) => void;
  onActivateTab?: () => void;
  onSelect?: (value?: string) => void | Promise<void>;
  /** Replaces the default `element.scrollIntoView({ block: 'center' })`. */
  scrollIntoView?: (element: HTMLElement, behavior?: ScrollBehavior) => void;
}

/**
 * Registers host-owned DOM behavior. Outside `IntegrationProvider` it does nothing, so shared
 * components can register targets whether or not a host is mounted. While highlighted, the
 * element carries {@link HIGHLIGHT_ATTRIBUTE}; the host chooses how it looks.
 */
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
    scrollIntoView,
  }: UiTargetOptions = {},
): { highlighted: boolean; ref: RefObject<T | null> } => {
  const targetRegistry = useOptionalIntegration()?.targetRegistry;
  const ref = useRef<T | null>(null);
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    const element = focusRef?.current ?? ref.current;

    if (!element || !targetRegistry) {
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
        const target = focusRef?.current ?? ref.current;

        if (!target) {
          return;
        }

        if (scrollIntoView) {
          scrollIntoView(target, behavior);
        } else {
          target.scrollIntoView({ behavior, block: 'center' });
        }
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
    scrollIntoView,
  ]);

  useEffect(() => {
    ref.current?.toggleAttribute(HIGHLIGHT_ATTRIBUTE, highlighted);
  }, [highlighted]);

  return { highlighted, ref };
};
