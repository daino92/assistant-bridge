import { attachHostPort, createPortAssistantClient } from '@/bridge';
import type { AssistantBridgeClient, AssistantCommandHandler } from '@/assistant-client';
import { createAssistantConnection, type AssistantConnectionOptions } from '@/connections';
import { internalsOf, type HostIntegration } from '@/create-host-integration';
import {
  ERROR_CODES,
  PROTOCOL_VERSION,
  hostContextSchema,
  isCompatibleProtocolVersion,
} from '@/contracts';

export interface HostPortOptions extends AssistantConnectionOptions {
  port: MessagePort;
}

/** The caller authenticates and transfers the port. This adapter never creates a frame. */
export const connectHostPort = (
  integration: HostIntegration,
  { port, ...options }: HostPortOptions,
) => {
  const { bridge, contextManager } = internalsOf(integration);

  const connection = createAssistantConnection(bridge, options, {
    code: 'CONNECTION_TIMEOUT',
    phase: 'handshake',
    mode: 'message-port',
    message: 'Assistant port handshake timed out.',
  });

  let detach: (() => void) | undefined;

  const receive = (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: string; protocolVersion?: unknown } | null;

    if (!connection.isActive()) {
      return;
    }

    if (data?.type === 'disconnect') {
      connection.dispose();

      return;
    }

    if (data?.type !== 'transport.ready' && data?.type !== 'transport.connected') {
      return;
    }

    if (!isCompatibleProtocolVersion(data.protocolVersion)) {
      connection.fail({
        code: 'PROTOCOL_MISMATCH',
        phase: 'handshake',
        mode: 'message-port',
        message: 'The assistant port uses an incompatible protocol version.',
        errorCode: ERROR_CODES.PROTOCOL_MISMATCH,
      });

      return;
    }

    if (data.type === 'transport.ready' && !detach) {
      detach = attachHostPort(port, bridge);
      port.postMessage({
        type: 'transport.context',
        protocolVersion: PROTOCOL_VERSION,
        context: contextManager.getSnapshot(),
      });
    } else if (data.type === 'transport.connected' && detach) {
      connection.ready();
    }
  };

  connection.attach(() => {
    port.removeEventListener('message', receive);

    if (detach) {
      detach();
    } else {
      port.postMessage({ type: 'disconnect' });
      port.close();
    }
  });
  port.addEventListener('message', receive);
  port.start();

  return connection;
};

export interface AssistantPortOptions {
  port: MessagePort;
  onCommand: AssistantCommandHandler;
  onClient: (client: AssistantBridgeClient | undefined) => void;
}

/** Receives an explicitly supplied trusted channel; it does not inspect windows or URLs. */
export const connectAssistantPort = ({ port, onCommand, onClient }: AssistantPortOptions) => {
  let remote: ReturnType<typeof createPortAssistantClient> | undefined;
  let active = true;

  const dispose = () => {
    if (!active) {
      return;
    }

    active = false;
    port.removeEventListener('message', receive);
    port.postMessage({ type: 'disconnect' });
    remote?.dispose();
    port.close();
    onClient(undefined);
  };

  const receive = (event: MessageEvent<unknown>) => {
    const data = event.data as {
      type?: string;
      protocolVersion?: unknown;
      context?: unknown;
    } | null;

    if (data?.type === 'disconnect') {
      dispose();

      return;
    }

    if (!active || remote || data?.type !== 'transport.context') {
      return;
    }

    const context = hostContextSchema.safeParse(data.context);

    if (!isCompatibleProtocolVersion(data.protocolVersion) || !context.success) {
      dispose();

      return;
    }

    remote = createPortAssistantClient(port, context.data, onCommand);
    onClient(remote.client);
    port.postMessage({ type: 'transport.connected', protocolVersion: PROTOCOL_VERSION });
  };

  port.addEventListener('message', receive);
  port.start();
  port.postMessage({ type: 'transport.ready', protocolVersion: PROTOCOL_VERSION });

  return { dispose };
};
