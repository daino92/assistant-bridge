import { ERROR_CODES } from '@/contracts';

export interface UiTarget {
  id: string;
  route?: string;
  label?: string;
  description?: string;
  highlight: () => void;
  clearHighlight: () => void;
  scrollIntoView: (behavior?: ScrollBehavior) => void;
  focus?: () => void;
  setValue?: (value: string) => void;
  setChecked?: (checked: boolean) => void;
  setExpanded?: (expanded: boolean) => void;
  activateTab?: () => void;
  select?: (value?: string) => void | Promise<void>;
}

export class UiTargetRegistry {
  private disposed = false;

  private targets = new Map<string, UiTarget>();

  private activeHighlights = new Map<string, ReturnType<typeof setTimeout>>();

  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    if (this.disposed) {
      return () => {};
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  describe() {
    return [...this.targets.values()].map((target) => ({
      id: target.id,
      label: target.label ?? target.id,
      ...(target.description ? { description: target.description } : {}),
      actions: [
        'highlight',
        'clearHighlight',
        'scrollTo',
        ...(target.focus ? ['focus'] : []),
        ...(target.setValue ? ['setValue'] : []),
        ...(target.setChecked ? ['setChecked'] : []),
        ...(target.setExpanded ? ['setExpanded'] : []),
        ...(target.activateTab ? ['activateTab'] : []),
        ...(target.select ? ['select'] : []),
      ] as (
        | 'highlight'
        | 'scrollTo'
        | 'focus'
        | 'select'
        | 'setValue'
        | 'setChecked'
        | 'setExpanded'
        | 'activateTab'
        | 'clearHighlight'
      )[],
    }));
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  register(target: UiTarget): () => void {
    if (this.disposed) {
      return () => {};
    }

    this.targets.set(target.id, target);
    this.notify();

    return () => {
      if (this.targets.get(target.id) === target) {
        this.unregister(target.id);
      }
    };
  }

  unregister(id: string): void {
    this.clearHighlight(id);
    this.targets.delete(id);
    this.notify();
  }

  resolve(id: string): UiTarget | undefined {
    return this.targets.get(id);
  }

  has(id: string): boolean {
    return this.targets.has(id);
  }

  highlight(id: string, durationMs = 3000): { success: boolean; error?: string } {
    const target = this.targets.get(id);

    if (!target) {
      return { success: false, error: ERROR_CODES.TARGET_NOT_FOUND };
    }

    this.clearHighlight(id);
    target.highlight();

    const timeoutId = setTimeout(() => {
      target.clearHighlight();
      this.activeHighlights.delete(id);
    }, durationMs);

    this.activeHighlights.set(id, timeoutId);

    return { success: true };
  }

  clearHighlight(id: string): void {
    const timeoutId = this.activeHighlights.get(id);

    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activeHighlights.delete(id);
    }

    const target = this.targets.get(id);

    target?.clearHighlight();
  }

  /** Validated action entry; internal cleanup can still clear an absent target. */
  clearTargetHighlight(id: string): { success: boolean; error?: string } {
    if (!this.targets.has(id)) {
      return { success: false, error: ERROR_CODES.TARGET_NOT_FOUND };
    }

    this.clearHighlight(id);

    return { success: true };
  }

  clearAllHighlights(): void {
    for (const id of this.activeHighlights.keys()) {
      this.clearHighlight(id);
    }
  }

  scrollTo(id: string, behavior: ScrollBehavior = 'smooth'): { success: boolean; error?: string } {
    const target = this.targets.get(id);

    if (!target) {
      return { success: false, error: ERROR_CODES.TARGET_NOT_FOUND };
    }

    target.scrollIntoView(behavior);

    return { success: true };
  }

  focus(id: string): { success: boolean; error?: string } {
    const target = this.targets.get(id);

    if (!target) {
      return { success: false, error: ERROR_CODES.TARGET_NOT_FOUND };
    }

    if (!target.focus) {
      return { success: false, error: ERROR_CODES.ACTION_NOT_AVAILABLE };
    }

    target.focus();

    return { success: true };
  }

  select(
    id: string,
    value?: string,
  ): { success: boolean; error?: string } | Promise<{ success: boolean; error?: string }> {
    const target = this.targets.get(id);

    if (!target) {
      return { success: false, error: ERROR_CODES.TARGET_NOT_FOUND };
    }

    if (!target.select) {
      return { success: false, error: ERROR_CODES.ACTION_NOT_AVAILABLE };
    }

    const completion = target.select(value);

    if (completion) {
      return completion.then(() => ({ success: true }));
    }

    return { success: true };
  }

  setValue(id: string, value: string): { success: boolean; error?: string } {
    const target = this.targets.get(id);

    if (!target) {
      return { success: false, error: ERROR_CODES.TARGET_NOT_FOUND };
    }

    if (!target.setValue) {
      return { success: false, error: ERROR_CODES.ACTION_NOT_AVAILABLE };
    }

    target.setValue(value);

    return { success: true };
  }

  setChecked(id: string, checked: boolean): { success: boolean; error?: string } {
    const target = this.targets.get(id);

    if (!target) {
      return { success: false, error: ERROR_CODES.TARGET_NOT_FOUND };
    }

    if (!target.setChecked) {
      return { success: false, error: ERROR_CODES.ACTION_NOT_AVAILABLE };
    }

    target.setChecked(checked);

    return { success: true };
  }

  setExpanded(id: string, expanded: boolean): { success: boolean; error?: string } {
    const target = this.targets.get(id);

    if (!target) {
      return { success: false, error: ERROR_CODES.TARGET_NOT_FOUND };
    }

    if (!target.setExpanded) {
      return { success: false, error: ERROR_CODES.ACTION_NOT_AVAILABLE };
    }

    target.setExpanded(expanded);

    return { success: true };
  }

  activateTab(id: string): { success: boolean; error?: string } {
    const target = this.targets.get(id);

    if (!target) {
      return { success: false, error: ERROR_CODES.TARGET_NOT_FOUND };
    }

    if (!target.activateTab) {
      return { success: false, error: ERROR_CODES.ACTION_NOT_AVAILABLE };
    }

    target.activateTab();

    return { success: true };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    try {
      this.clearAllHighlights();
    } finally {
      for (const timer of this.activeHighlights.values()) {
        clearTimeout(timer);
      }

      this.activeHighlights.clear();
      this.targets.clear();
      this.listeners.clear();
    }
  }

  listIds(): string[] {
    return Array.from(this.targets.keys());
  }
}
