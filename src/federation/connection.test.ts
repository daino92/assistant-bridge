import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHostIntegration } from '@/create-host-integration';
import type { IntegrationTimelineEntry } from '@/contracts';

import { connectFederatedAssistant } from '@/federation';

const runtime = vi.hoisted(() => ({
  options: { name: 'test-runtime', remotes: [] as Array<{ name: string; entry: string }> },
  registerRemotes: vi.fn(),
  loadRemote: vi.fn(),
}));

vi.mock('@module-federation/runtime', () => ({
  getInstance: (predicate: (instance: typeof runtime) => boolean) =>
    predicate(runtime) ? runtime : undefined,
}));

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
  vi.resetAllMocks();
  runtime.options.remotes = [];
  vi.useRealTimers();
});

const connect = (runtimeName = 'test-runtime', attempt = 0) => {
  const timeline: IntegrationTimelineEntry[] = [];

  const integration = createHostIntegration({
    appId: 'test',
    actions: [],
    onTimeline: (entry) => timeline.push(entry),
  });

  const onStatus = vi.fn();

  const connection = connectFederatedAssistant(integration, {
    runtimeName,
    remoteName: 'chat',
    exposedModule: 'Assistant',
    entry: 'https://chat.example/remoteEntry.js',
    attempt,
    onStatus,
    timeoutMs: 1000,
  });

  cleanups.push(() => integration.bridge.destroy(), connection.dispose);

  return { integration, connection, onStatus, timeline };
};

describe('federation adapter', () => {
  it.each([
    ['missing-runtime', 'FEDERATION_RUNTIME_UNAVAILABLE'],
    ['missing-export', 'FEDERATION_EXPORT_MISSING'],
    ['load-error', 'FEDERATION_LOAD_FAILED'],
  ])('distinguishes %s failures without exposing remote exceptions', async (failure, code) => {
    if (failure === 'load-error') {
      runtime.loadRemote.mockRejectedValue(new Error('sensitive remote URL or token'));
    } else {
      runtime.loadRemote.mockResolvedValue({});
    }

    const { connection, timeline } = connect(
      failure === 'missing-runtime' ? 'absent' : 'test-runtime',
    );

    await connection.load;

    const diagnostics = timeline.filter((entry) => entry.diagnostic);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].diagnostic).toMatchObject({
      code,
      mode: 'federation',
      phase: 'remote-load',
    });
    expect(JSON.stringify(diagnostics)).not.toContain('sensitive remote');
  });

  it('replaces an already registered remote when its entry URL changes', async () => {
    runtime.options.remotes.push({ name: 'chat', entry: 'https://old.example/remoteEntry.js' });
    runtime.loadRemote.mockResolvedValue({ default: {} });

    const { connection } = connect();

    await connection.load;
    expect(runtime.registerRemotes).toHaveBeenCalledWith(
      [{ name: 'chat', entry: 'https://chat.example/remoteEntry.js', type: 'module' }],
      { force: true },
    );
  });
  it('loads the configured export, cache busts retries, and waits for command registration', async () => {
    const exported = {};

    runtime.loadRemote.mockResolvedValue({ default: exported });

    const { integration, connection, onStatus } = connect('test-runtime', 2);

    await expect(connection.load).resolves.toBe(exported);
    expect(runtime.registerRemotes).toHaveBeenCalledWith(
      [{ name: 'chat', entry: 'https://chat.example/remoteEntry.js?reconnect=2', type: 'module' }],
      { force: true },
    );
    expect(runtime.loadRemote).toHaveBeenCalledWith('chat/Assistant');
    expect(onStatus).toHaveBeenLastCalledWith('loading');
    connection.onReady(() => 'ok');
    expect(onStatus).toHaveBeenLastCalledWith('ready');
    await expect(integration.assistantCommands.open()).resolves.toBe('ok');
  });

  it('reports missing runtimes and remote errors without leaving an available receiver', async () => {
    const missing = connect('missing');

    await expect(missing.connection.load).resolves.toBeUndefined();
    expect(missing.onStatus).toHaveBeenLastCalledWith('error');
    runtime.loadRemote.mockRejectedValue(new Error('Network failure'));

    const failed = connect();

    await expect(failed.connection.load).resolves.toBeUndefined();
    expect(failed.onStatus).toHaveBeenLastCalledWith('error');
    expect(failed.integration.bridge.isAssistantAvailable()).toBe(false);
  });

  it('ignores remote exports arriving after timeout or disposal', async () => {
    vi.useFakeTimers();

    let resolve: (value: { default: object }) => void = () => {};

    runtime.loadRemote.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );

    const timedOut = connect();

    vi.advanceTimersByTime(1000);
    await expect(timedOut.connection.load).resolves.toBeUndefined();
    resolve({ default: {} });
    await expect(timedOut.connection.load).resolves.toBeUndefined();
    expect(timedOut.onStatus).toHaveBeenLastCalledWith('error');

    const disposed = connect();

    disposed.connection.dispose();
    await expect(disposed.connection.load).resolves.toBeUndefined();
    resolve({ default: {} });
    await expect(disposed.connection.load).resolves.toBeUndefined();
    expect(disposed.integration.bridge.isAssistantAvailable()).toBe(false);
  });
});
