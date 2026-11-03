import { afterEach, expect, it, vi } from 'vitest';

import { createHostIntegration } from '@/create-host-integration';
import { createAssistantConnection } from '@/connections';
import type { IntegrationTimelineEntry } from '@/contracts';

afterEach(() => vi.useRealTimers());

it('reports one structured timeout through the existing timeline and ignores late readiness', () => {
  vi.useFakeTimers();

  const timeline: IntegrationTimelineEntry[] = [];

  const integration = createHostIntegration({
    actions: [],
    onTimeline: (entry) => timeline.push(entry),
  });

  const onStatus = vi.fn();

  try {
    const connection = createAssistantConnection(
      integration.bridge,
      { onStatus, timeoutMs: 20 },
      {
        code: 'IFRAME_HANDSHAKE_TIMEOUT',
        phase: 'handshake',
        mode: 'iframe',
        message: 'Assistant iframe handshake timed out.',
      },
    );

    vi.advanceTimersByTime(20);
    connection.ready();
    connection.fail();
    connection.dispose();

    const diagnostics = timeline.filter((entry) => entry.diagnostic);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].diagnostic).toMatchObject({
      code: 'IFRAME_HANDSHAKE_TIMEOUT',
      mode: 'iframe',
      phase: 'handshake',
    });
    expect(onStatus.mock.calls).toEqual([['loading'], ['error']]);
    expect(integration.bridge.isAssistantAvailable()).toBe(false);
  } finally {
    integration.bridge.destroy();
  }
});

it('correlates action failures and unavailable commands without including their payloads', async () => {
  const timeline: IntegrationTimelineEntry[] = [];

  const integration = createHostIntegration({
    actions: [],
    onTimeline: (entry) => timeline.push(entry),
  });

  try {
    await expect(
      integration.assistantClient.requestHostAction('unknown.action', {
        secret: 'private-action-data',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_ACTION' });
    await expect(
      integration.assistantCommands.submitPrompt('private-prompt'),
    ).rejects.toMatchObject({ code: 'RECEIVER_UNAVAILABLE' });

    const actionDiagnostic = timeline.find((entry) => entry.diagnostic?.code === 'ACTION_FAILED');

    const actionRequest = timeline.find(
      (entry) => entry.name === 'unknown.action' && entry.kind === 'command-request',
    );

    expect(actionDiagnostic?.diagnostic).toMatchObject({
      phase: 'action',
      errorCode: 'UNKNOWN_ACTION',
    });
    expect(actionDiagnostic?.requestId).toBe(actionRequest?.requestId);
    expect(timeline.some((entry) => entry.diagnostic?.code === 'COMMAND_FAILED')).toBe(true);
    expect(JSON.stringify(timeline)).not.toContain('private-action-data');
    expect(JSON.stringify(timeline)).not.toContain('private-prompt');
  } finally {
    integration.bridge.destroy();
  }
});

it('does not report an error for deliberate connection disposal', () => {
  vi.useFakeTimers();

  const onTimeline = vi.fn();
  const integration = createHostIntegration({ actions: [], onTimeline });

  try {
    const connection = createAssistantConnection(integration.bridge, {
      onStatus: vi.fn(),
      timeoutMs: 20,
    });

    connection.dispose();
    vi.advanceTimersByTime(100);
    expect(onTimeline.mock.calls.some(([entry]) => entry.diagnostic)).toBe(false);
  } finally {
    integration.bridge.destroy();
  }
});
