import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineAction } from '@/actions';
import { HOST_ACTION_NAMES, type HostContext } from '@/contracts';
import { definePageCatalog } from '@/host-context';
import {
  AssistantHost,
  HIGHLIGHT_ATTRIBUTE,
  useAssistantHost,
  usePageEntities,
  useUiTarget,
  type AssistantHostValue,
} from '@/react';

afterEach(cleanup);

const MODEL = '7f1c2a9e-3b4d-4c5e-8f6a-1b2c3d4e5f60';

const PAGES = definePageCatalog({
  dashboard: { title: 'Dashboard', type: 'dashboard' },
  content: {
    title: 'Content',
    type: 'content',
    needs: 'content:read',
    params: z.object({ model: z.uuid().optional() }).strict().optional(),
  },
  settings: { title: 'Settings', type: 'settings', needs: 'scope:manage' },
});

let host: AssistantHostValue | null = null;

const Capture = () => {
  host = useAssistantHost();

  return null;
};

const Entry = ({ label }: { label: string }) => {
  usePageEntities([{ type: 'entry', id: 'e1', label }]);

  return null;
};

const context = (): HostContext => host!.integration.assistantClient.getContext();

const request = (payload: unknown) =>
  host!.integration.assistantClient.requestHostAction(HOST_ACTION_NAMES.UI_NAVIGATE, payload);

describe('AssistantHost', () => {
  it('publishes page, principal, destinations and entities, and navigates with parameters', async () => {
    const navigate = vi.fn();
    const principal = { id: 'u', permissions: ['content:read'] };

    const view = (permissions: string[], label = 'Home') => (
      <AssistantHost
        pages={PAGES}
        router={{ pathname: '/content', navigate }}
        principal={{ ...principal, permissions }}
        entities={[{ type: 'environment', id: 'env', label: 'UAT' }]}
      >
        <Capture />
        <Entry label={label} />
      </AssistantHost>
    );

    const { rerender } = render(view(['content:read']));

    await waitFor(() => expect(context().principal?.permissions).toEqual(['content:read']));
    expect(context().page).toEqual({ title: 'Content', type: 'content' });
    expect(context().destinations).toEqual([
      { path: '/dashboard', label: 'Dashboard' },
      { path: '/content', label: 'Content' },
    ]);
    expect(context().entities?.map((entity) => entity.label)).toEqual(['UAT', 'Home']);

    await request({ path: '/content', params: { model: MODEL } });
    expect(navigate).toHaveBeenLastCalledWith('/content', { model: MODEL });
    await expect(request({ path: '/settings' })).rejects.toMatchObject({
      code: 'ACTION_NOT_AVAILABLE',
    });

    // Permission changes update destinations and actions without a remount.
    const integration = host!.integration;

    rerender(view(['content:read', 'scope:manage'], 'Renamed'));
    await waitFor(() => expect(context().destinations).toHaveLength(3));
    expect(host!.integration).toBe(integration);
    expect(context().entities?.map((entity) => entity.label)).toEqual(['UAT', 'Renamed']);
    await request({ path: '/settings' });
    expect(navigate).toHaveBeenLastCalledWith('/settings');
  });

  it('adds host actions with the latest router callback and removes page entities on unmount', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const handler = vi.fn(({ id }: { id: string }) => ({ opened: id }));

    const view = (navigate: typeof first, showEntry: boolean) => (
      <AssistantHost
        pages={PAGES}
        router={{ pathname: '/unknown', navigate }}
        fallbackPage={{ title: 'Other', type: 'other' }}
        actions={({ navigate: go }) => [
          defineAction({
            name: 'cms.open',
            description: 'Open',
            schema: z.object({ id: z.string() }),
            handler: (input) => {
              void go('/dashboard');

              return handler(input);
            },
          }),
        ]}
      >
        <Capture />
        {showEntry ? <Entry label="Home" /> : null}
      </AssistantHost>
    );

    const { rerender } = render(view(first, true));

    await waitFor(() => expect(context().entities).toHaveLength(1));
    expect(context().page).toEqual({ title: 'Other', type: 'other' });

    rerender(view(second, false));
    await waitFor(() => expect(context().entities).toEqual([]));

    await host!.integration.assistantClient.requestHostAction('cms.open', { id: 'x' });
    expect(handler).toHaveBeenCalledWith({ id: 'x' });
    expect(second).toHaveBeenCalledWith('/dashboard');
    expect(first).not.toHaveBeenCalled();
  });

  it('connects an embedded assistant and asks through it', async () => {
    const commands = vi.fn(() => 'ok');

    render(
      <AssistantHost
        pages={PAGES}
        router={{ pathname: '/dashboard', navigate: vi.fn() }}
        connection="embedded"
      >
        <Capture />
      </AssistantHost>,
    );

    await waitFor(() => expect(host!.embedded).not.toBeNull());

    act(() => {
      host!.embedded!.onReady(commands);
    });
    await host!.ask('What can I do?');
    expect(commands).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'assistant.submitPrompt' }),
    );
  });

  it('marks highlighted targets and adds the optional default style', async () => {
    const Button = () => {
      const { ref } = useUiTarget<HTMLButtonElement>('save', { label: 'Save' });

      return (
        <button ref={ref} type="button">
          Save
        </button>
      );
    };

    const { container } = render(
      <AssistantHost pages={PAGES} router={{ pathname: '/dashboard', navigate: vi.fn() }} highlight>
        <Capture />
        <Button />
      </AssistantHost>,
    );

    expect(container.querySelector('style')?.textContent).toContain(`[${HIGHLIGHT_ATTRIBUTE}]`);

    act(() => {
      host!.integration.targetRegistry.highlight('save', 1000);
    });
    await waitFor(() =>
      expect(screen.getByRole('button').hasAttribute(HIGHLIGHT_ATTRIBUTE)).toBe(true),
    );
  });
});

describe('hooks outside AssistantHost', () => {
  it('do nothing', () => {
    const Outside = () => {
      const { ref } = useUiTarget<HTMLButtonElement>('save');

      usePageEntities([{ type: 'entry', id: 'e1', label: 'Home' }]);

      host = useAssistantHost();

      return <button ref={ref} type="button" />;
    };

    render(<Outside />);
    expect(host).toBeNull();
  });
});
