import { createContext, useContext } from 'react';

import type { EmbeddedAssistantOptions } from '@/assistant-client';
import type { HostContext } from '@/contracts';
import type { HostIntegration } from '@/create-host-integration';

export const IntegrationContext = createContext<HostIntegration | null>(null);

/** Returns the integration, or `null` outside `IntegrationProvider` (for example before sign-in). */
export const useOptionalIntegration = (): HostIntegration | null => useContext(IntegrationContext);

export const useIntegration = (): HostIntegration => {
  const integration = useOptionalIntegration();

  if (!integration) {
    throw new Error('useIntegration must be used within IntegrationProvider');
  }

  return integration;
};

export interface AssistantHostValue {
  integration: HostIntegration;
  /** Opens the assistant and submits the prompt; rejects when no assistant is ready. */
  ask: (prompt: string) => Promise<unknown>;
  /** Same-window connection when `connection="embedded"`, otherwise `null`. */
  embedded: EmbeddedAssistantOptions | null;
  /** Publishes the entities of one mounted page component; `null` removes them. */
  publishPageEntities: (owner: symbol, entities: HostEntities | null) => void;
}

type HostEntities = NonNullable<HostContext['entities']>;

export const AssistantHostContext = createContext<AssistantHostValue | null>(null);

/** The surrounding `AssistantHost`, or `null` outside one. */
export const useAssistantHost = (): AssistantHostValue | null => useContext(AssistantHostContext);
