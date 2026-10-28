import { getInstance } from '@module-federation/runtime';

import { connectEmbeddedAssistant, type AssistantConnectionOptions } from '@/connections';
import type { HostIntegration } from '@/create-host-integration';
import type { IntegrationDiagnostic } from '@/contracts';

export interface FederatedAssistantConnectionOptions extends AssistantConnectionOptions {
  runtimeName: string;
  remoteName: string;
  exposedModule: string;
  entry: string;
  attempt?: number;
}

/** Framework-neutral remote loading; the host decides how to render the exported value. */
export const connectFederatedAssistant = <T>(
  integration: HostIntegration,
  options: FederatedAssistantConnectionOptions,
) => {
  const connection = connectEmbeddedAssistant(
    integration,
    {
      ...options,
      assistantId: options.assistantId ?? 'assistant-federation',
    },
    {
      code: 'CONNECTION_TIMEOUT',
      phase: 'remote-load',
      mode: 'federation',
      message: 'Federated assistant remote loading timed out.',
    },
  );

  const load = async (): Promise<T | undefined> => {
    let code: IntegrationDiagnostic['code'] = 'FEDERATION_LOAD_FAILED';

    try {
      const federation = getInstance((instance) => instance.options.name === options.runtimeName);

      if (!federation) {
        code = 'FEDERATION_RUNTIME_UNAVAILABLE';

        throw new Error(`Federation runtime ${options.runtimeName} is unavailable`);
      }

      const entry = new URL(options.entry, window.location.origin);

      if (options.attempt) {
        entry.searchParams.set('reconnect', String(options.attempt));
      }

      const registered = federation.options.remotes.find(
        (item) => item.name === options.remoteName,
      );

      if (!registered || ('entry' in registered && registered.entry !== entry.href)) {
        federation.registerRemotes(
          [{ name: options.remoteName, entry: entry.href, type: 'module' }],
          {
            force: Boolean(options.attempt) || Boolean(registered),
          },
        );
      }

      const remote = await federation.loadRemote<{ default: T }>(
        `${options.remoteName}/${options.exposedModule}`,
      );

      if (!remote?.default) {
        code = 'FEDERATION_EXPORT_MISSING';

        throw new Error('Assistant remote has no default export');
      }

      connection.setTimeoutDiagnostic({
        code: 'CONNECTION_TIMEOUT',
        phase: 'receiver-ready',
        mode: 'federation',
        message: 'Federated assistant command receiver did not become ready in time.',
      });

      return connection.isActive() ? remote.default : undefined;
    } catch {
      connection.fail({
        code,
        phase: 'remote-load',
        mode: 'federation',
        message: 'Federated assistant remote could not be loaded.',
      });

      return undefined;
    }
  };

  return {
    ...connection,
    load: Promise.race([load(), connection.closed.then(() => undefined)]),
  };
};
