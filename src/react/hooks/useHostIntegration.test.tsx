import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { attachAssistantCommandHandler } from '@/assistant-client';
import { ERROR_CODES } from '@/contracts';
import type { CreateHostIntegrationOptions } from '@/create-host-integration';
import { useHostIntegration } from '@/react/hooks';

interface WrapperProps {
  children: ReactNode;
}

const Wrapper = ({ children }: WrapperProps) => <StrictMode>{children}</StrictMode>;

afterEach(async () => {
  cleanup();
  await Promise.resolve();
  vi.restoreAllMocks();
});

describe('useHostIntegration', () => {
  it('survives Strict Mode replay and destroys its stable instance only on final unmount', async () => {
    const onTimeline = vi.fn();
    const options: CreateHostIntegrationOptions = { appId: 'test', actions: [], onTimeline };

    const { result, rerender, unmount } = renderHook((props) => useHostIntegration(props), {
      initialProps: options,
      wrapper: Wrapper,
    });

    const integration = result.current;
    const destroy = vi.spyOn(integration.bridge, 'destroy');
    const disposeIntegration = vi.spyOn(integration, 'dispose');

    expect(onTimeline).toHaveBeenCalledOnce();
    expect(integration.bridge.bus.listenerCount('host.action.request')).toBe(1);
    rerender({ ...options });
    expect(result.current).toBe(integration);

    const detach = attachAssistantCommandHandler(integration.bridge, () => 'ack');

    integration.bridge.notifyAssistantReady('test');
    await expect(integration.assistantCommands.open()).resolves.toBe('ack');
    expect(destroy).not.toHaveBeenCalled();
    expect(disposeIntegration).not.toHaveBeenCalled();
    unmount();
    await Promise.resolve();
    expect(destroy).toHaveBeenCalledOnce();
    expect(disposeIntegration).toHaveBeenCalledOnce();
    expect(integration.bridge.isAssistantAvailable()).toBe(false);
    expect(integration.bridge.bus.listenerCount('host.action.request')).toBe(0);
    detach();
  });

  it('updates action handlers and timeline callbacks without recreating the integration or bumping unchanged capabilities', async () => {
    const firstHandler = vi.fn(() => 'first');
    const firstTimeline = vi.fn();
    const schema = z.object({});

    const options: CreateHostIntegrationOptions = {
      appId: 'test',
      onTimeline: firstTimeline,
      actions: () => [{ name: 'test.action', description: 'Test', schema, handler: firstHandler }],
    };

    const { result, rerender } = renderHook((props) => useHostIntegration(props), {
      initialProps: options,
      wrapper: Wrapper,
    });

    const integration = result.current;

    await expect(integration.assistantClient.requestHostAction('test.action', {})).resolves.toBe(
      'first',
    );

    const revision = integration.contextManager.getSnapshot().revision;
    const nextHandler = vi.fn(() => 'next');
    const nextTimeline = vi.fn();

    const updated: CreateHostIntegrationOptions = {
      ...options,
      onTimeline: nextTimeline,
      actions: () => [{ name: 'test.action', description: 'Test', schema, handler: nextHandler }],
    };

    rerender(updated);
    expect(result.current).toBe(integration);
    expect(integration.contextManager.getSnapshot().revision).toBe(revision);

    const previousEvents = firstTimeline.mock.calls.length;

    await expect(integration.assistantClient.requestHostAction('test.action', {})).resolves.toBe(
      'next',
    );
    expect(nextHandler).toHaveBeenCalledOnce();
    expect(firstHandler).toHaveBeenCalledOnce();
    expect(firstTimeline).toHaveBeenCalledTimes(previousEvents);
    expect(nextTimeline).toHaveBeenCalled();
    rerender({
      ...updated,
      actions: [{ name: 'other.action', description: 'Other', schema, handler: nextHandler }],
    });
    expect(integration.contextManager.getSnapshot().capabilities.map((item) => item.name)).toEqual([
      'other.action',
    ]);
    await expect(
      integration.assistantClient.requestHostAction('test.action', {}),
    ).rejects.toMatchObject({ code: ERROR_CODES.UNKNOWN_ACTION });
  });

  it('clears active highlights and rejects pending commands on final unmount', async () => {
    const { result, unmount } = renderHook(
      () => useHostIntegration({ appId: 'test', actions: [] }),
      { wrapper: Wrapper },
    );

    const integration = result.current;
    const clearHighlight = vi.fn();

    integration.targetRegistry.register({
      id: 'target',
      highlight: vi.fn(),
      clearHighlight,
      scrollIntoView: vi.fn(),
    });
    integration.targetRegistry.highlight('target');
    clearHighlight.mockClear();

    const detach = attachAssistantCommandHandler(integration.bridge, () => new Promise(() => {}));

    integration.bridge.notifyAssistantReady('test');

    const pending = integration.assistantCommands.open();

    const rejected = expect(pending).rejects.toMatchObject({
      code: ERROR_CODES.RECEIVER_UNAVAILABLE,
    });

    await act(async () => {
      unmount();
      await Promise.resolve();
    });
    await rejected;
    expect(clearHighlight).toHaveBeenCalledOnce();
    expect(integration.bridge.bus.listenerCount('assistant.command.request')).toBe(0);
    detach();
  });
});
