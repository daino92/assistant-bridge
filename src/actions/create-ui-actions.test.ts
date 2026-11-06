import { afterEach, describe, expect, it, vi } from 'vitest';

import { UI_TARGET_ACTIONS, createUiActions } from '@/actions';
import { createHostIntegration } from '@/create-host-integration';
import { ERROR_CODES, HOST_ACTION_NAMES } from '@/contracts';
import { createIntegrationError } from '@/errors';

const disposers: Array<() => void> = [];

afterEach(() => {
  disposers
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
});

describe('createUiActions', () => {
  it('UI_TARGET_ACTIONS lists every built-in UI target tool', () => {
    expect(UI_TARGET_ACTIONS).toEqual([
      'highlight',
      'scrollTo',
      'focus',
      'select',
      'setValue',
      'setChecked',
      'setExpanded',
      'activateTab',
      'clearHighlight',
    ]);
  });

  it('enables only selected target actions and preserves payload and target validation', async () => {
    const focus = vi.fn();

    const integration = createHostIntegration({
      actions: ({ targets }) =>
        createUiActions({ targets: { registry: targets, enable: ['focus', 'focus'] } }),
    });

    disposers.push(() => integration.bridge.destroy());
    integration.targetRegistry.register({
      id: 'search',
      focus,
      highlight: vi.fn(),
      clearHighlight: vi.fn(),
      scrollIntoView: vi.fn(),
    });
    expect(focus).not.toHaveBeenCalled();
    await expect(
      integration.assistantClient.requestHostAction(HOST_ACTION_NAMES.UI_FOCUS, {
        targetId: 'search',
      }),
    ).resolves.toEqual({ targetId: 'search' });
    expect(focus).toHaveBeenCalledOnce();
    await expect(
      integration.assistantClient.requestHostAction(HOST_ACTION_NAMES.UI_HIGHLIGHT, {
        targetId: 'search',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.UNKNOWN_ACTION });
    await expect(
      integration.assistantClient.requestHostAction(HOST_ACTION_NAMES.UI_FOCUS, { targetId: 42 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_PAYLOAD });
    await expect(
      integration.assistantClient.requestHostAction(HOST_ACTION_NAMES.UI_FOCUS, {
        targetId: 'missing',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.TARGET_NOT_FOUND });
    expect(
      integration.contextManager.getSnapshot().capabilities.map((capability) => capability.name),
    ).toEqual([HOST_ACTION_NAMES.UI_FOCUS]);
  });

  it('keeps navigation policy and detail routing in host callbacks without implicit registrations', async () => {
    const navigate = vi.fn();
    const openDetails = vi.fn();

    const integration = createHostIntegration({
      actions: createUiActions({
        navigation: { navigate, allowedRoutes: ['/catalog'], detailPattern: /^\/catalog\/[^/]+$/ },
        details: { open: openDetails },
      }),
    });

    disposers.push(() => integration.bridge.destroy());
    expect(navigate).not.toHaveBeenCalled();
    expect(openDetails).not.toHaveBeenCalled();
    await integration.assistantClient.requestHostAction(HOST_ACTION_NAMES.UI_NAVIGATE, {
      path: '/catalog/item',
    });
    expect(navigate).toHaveBeenCalledWith('/catalog/item');
    await expect(
      integration.assistantClient.requestHostAction(HOST_ACTION_NAMES.UI_NAVIGATE, {
        path: '/settings',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.ACTION_NOT_AVAILABLE });
    expect(navigate).toHaveBeenCalledOnce();
    await integration.assistantClient.requestHostAction(HOST_ACTION_NAMES.UI_OPEN_DETAILS, {
      entityType: 'catalog',
      id: 'item',
    });
    expect(openDetails).toHaveBeenCalledWith('catalog', 'item');
    expect(createUiActions()).toEqual([]);
    expect(
      integration.contextManager.getSnapshot().capabilities.map((capability) => capability.name),
    ).toEqual([HOST_ACTION_NAMES.UI_NAVIGATE, HOST_ACTION_NAMES.UI_OPEN_DETAILS]);
  });

  it('waits for async navigation and propagates host navigation failures', async () => {
    let finishNavigation = () => {};

    const navigate = vi.fn((path: string) => {
      if (path === '/blocked') {
        return Promise.reject(createIntegrationError(ERROR_CODES.ACTION_NOT_AVAILABLE));
      }

      return new Promise<void>((resolve) => {
        finishNavigation = resolve;
      });
    });

    const integration = createHostIntegration({
      actions: createUiActions({
        navigation: { navigate, allowedRoutes: ['/catalog', '/blocked'] },
      }),
    });

    disposers.push(() => integration.bridge.destroy());

    const settled = vi.fn();

    const pending = integration.assistantClient
      .requestHostAction(HOST_ACTION_NAMES.UI_NAVIGATE, { path: '/catalog' })
      .then(settled);

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/catalog'));
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    finishNavigation();
    await pending;
    expect(settled).toHaveBeenCalledWith({ path: '/catalog' });
    await expect(
      integration.assistantClient.requestHostAction(HOST_ACTION_NAMES.UI_NAVIGATE, {
        path: '/blocked',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.ACTION_NOT_AVAILABLE });
  });
});
