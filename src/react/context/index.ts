import { createContext, useContext } from 'react';

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
