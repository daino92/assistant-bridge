import { StrictMode, useRef, type ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHostIntegration } from '@/create-host-integration';
import { IntegrationProvider, useUiTarget } from '@/react';

interface WrapperProps {
  children: ReactNode;
}

interface TargetProps {
  id: string;
  onSelect: (value?: string) => void;
}

const Target = ({ id, onSelect }: TargetProps) => {
  const focusRef = useRef<HTMLInputElement>(null);
  const { ref, highlighted } = useUiTarget<HTMLDivElement>(id, { focusRef, onSelect });

  return (
    <div ref={ref} data-testid="target" data-highlighted={highlighted}>
      <input ref={focusRef} aria-label="Target input" />
    </div>
  );
};

const disposers: Array<() => void> = [];

afterEach(() => {
  cleanup();
  disposers
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
});

describe('useUiTarget', () => {
  it('registers DOM behavior, clears highlights and removes obsolete targets on rerender/unmount', () => {
    const integration = createHostIntegration({ actions: [] });

    disposers.push(() => integration.bridge.destroy());

    const Wrapper = ({ children }: WrapperProps) => (
      <StrictMode>
        <IntegrationProvider integration={integration}>{children}</IntegrationProvider>
      </StrictMode>
    );

    const firstSelect = vi.fn();

    const { rerender, unmount } = render(<Target id="first" onSelect={firstSelect} />, {
      wrapper: Wrapper,
    });

    const input = screen.getByRole('textbox');
    const scrollIntoView = vi.fn();

    input.scrollIntoView = scrollIntoView;
    expect(integration.targetRegistry.listIds()).toEqual(['first']);
    act(() => {
      integration.targetRegistry.highlight('first');
      integration.targetRegistry.focus('first');
      integration.targetRegistry.scrollTo('first', 'auto');
      integration.targetRegistry.select('first', 'selected');
    });
    expect(screen.getByTestId('target').getAttribute('data-highlighted')).toBe('true');
    expect(document.activeElement).toBe(input);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
    expect(firstSelect).toHaveBeenCalledWith('selected');
    act(() => integration.targetRegistry.clearAllHighlights());
    expect(screen.getByTestId('target').getAttribute('data-highlighted')).toBe('false');

    const nextSelect = vi.fn();

    rerender(<Target id="second" onSelect={nextSelect} />);
    expect(integration.targetRegistry.listIds()).toEqual(['second']);
    act(() => integration.targetRegistry.select('second', 'next'));
    expect(nextSelect).toHaveBeenCalledWith('next');
    expect(firstSelect).toHaveBeenCalledOnce();
    unmount();
    expect(integration.targetRegistry.listIds()).toEqual([]);
  });
});

it('advertises only mounted target interactions without inventing focus or select support', () => {
  const integration = createHostIntegration({ actions: [] });

  disposers.push(() => integration.bridge.destroy());

  const CardTarget = () => {
    const { ref } = useUiTarget<HTMLDivElement>('revenue', { label: 'Revenue pipeline' });

    return <div ref={ref}>Revenue</div>;
  };

  const { unmount } = render(
    <IntegrationProvider integration={integration}>
      <CardTarget />
    </IntegrationProvider>,
  );

  expect(integration.contextManager.getSnapshot().targets).toEqual([
    { id: 'revenue', label: 'Revenue pipeline', actions: ['highlight', 'scrollTo'] },
  ]);
  unmount();
  expect(integration.contextManager.getSnapshot().targets).toEqual([]);
});
