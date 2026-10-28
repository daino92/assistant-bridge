import type { ReactNode } from 'react';

import type { HostIntegration } from '@/create-host-integration';

import { IntegrationContext } from '@/react/context';

interface IntegrationProviderProps {
  integration: HostIntegration;
  children: ReactNode;
}

const IntegrationProvider = ({ integration, children }: IntegrationProviderProps) => (
  <IntegrationContext.Provider value={integration}>{children}</IntegrationContext.Provider>
);

export default IntegrationProvider;
