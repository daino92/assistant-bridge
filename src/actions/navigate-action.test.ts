import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { navigateAction } from '@/actions';
import { createHostIntegration } from '@/create-host-integration';
import { ERROR_CODES, HOST_ACTION_NAMES } from '@/contracts';

const UUID = '7f1c2a9e-3b4d-4c5e-8f6a-1b2c3d4e5f60';

const disposers: Array<() => void> = [];

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
});

const setup = () => {
  const navigate = vi.fn();
  const beforeNavigate = vi.fn();

  const integration = createHostIntegration({
    actions: [
      navigateAction({
        navigate,
        beforeNavigate,
        allowedRoutes: ['/settings'],
        routes: {
          '/content': {
            description: 'Entries of one model',
            params: z.object({ model: z.uuid(), entry: z.uuid().optional() }).strict(),
          },
        },
      }),
    ],
  });

  disposers.push(() => integration.dispose());

  const go = (payload: unknown) =>
    integration.assistantClient.requestHostAction(HOST_ACTION_NAMES.UI_NAVIGATE, payload);

  return { integration, navigate, beforeNavigate, go };
};

describe('navigateAction routes with parameters', () => {
  it('passes validated parameters to the host and keeps plain routes unchanged', async () => {
    const { navigate, beforeNavigate, go } = setup();

    await expect(go({ path: '/content', params: { model: UUID } })).resolves.toEqual({
      path: '/content',
      params: { model: UUID },
    });
    expect(beforeNavigate).toHaveBeenCalledWith('/content', { model: UUID });
    expect(navigate).toHaveBeenCalledWith('/content', { model: UUID });

    await go({ path: '/settings' });
    expect(navigate).toHaveBeenLastCalledWith('/settings');
  });

  it('rejects invalid, unknown or missing parameters without navigating', async () => {
    const { navigate, go } = setup();

    await expect(go({ path: '/content', params: { model: 'not-a-uuid' } })).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_PAYLOAD,
    });
    await expect(
      go({ path: '/content', params: { model: UUID, injected: '?admin=1' } }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_PAYLOAD });
    await expect(go({ path: '/content' })).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_PAYLOAD,
    });
    await expect(go({ path: '/settings', params: { model: UUID } })).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_PAYLOAD,
    });
    await expect(go({ path: '/admin', params: { model: UUID } })).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_PAYLOAD,
    });
    await expect(go({ path: '/admin' })).rejects.toMatchObject({
      code: ERROR_CODES.ACTION_NOT_AVAILABLE,
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('publishes each route and its parameter schema to the assistant', () => {
    const { integration } = setup();

    const capability = integration.contextManager
      .getSnapshot()
      .capabilities.find((item) => item.name === HOST_ACTION_NAMES.UI_NAVIGATE)!;

    const schema = JSON.stringify(capability.parametersSchema);

    expect(schema).toContain('"const":"/content"');
    expect(schema).toContain('Entries of one model');
    expect(schema).toContain('"model"');
    expect(capability.description).toContain('params');
  });

  it('keeps the original payload schema when no routes are configured', () => {
    const integration = createHostIntegration({
      actions: [navigateAction({ navigate: vi.fn(), allowedRoutes: ['/a'] })],
    });

    disposers.push(() => integration.dispose());

    const [capability] = integration.contextManager.getSnapshot().capabilities;

    expect(capability.parametersSchema).toMatchObject({
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    });
  });
});
