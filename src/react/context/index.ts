import { createContext, useContext } from 'react';

import type { HostIntegration } from '@/create-host-integration';

export const IntegrationContext = createContext<HostIntegration | null>(null);

export const useIntegration = (): HostIntegration => {
  const integration = useContext(IntegrationContext);

  if (!integration) {
    throw new Error('useIntegration must be used within IntegrationProvider');
  }

  return integration;
};
