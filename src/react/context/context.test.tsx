import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { createHostIntegration } from '@/create-host-integration';
import { IntegrationProvider, useIntegration, useOptionalIntegration } from '@/react';

it('returns null outside IntegrationProvider while useIntegration still throws', () => {
  expect(renderHook(() => useOptionalIntegration()).result.current).toBeNull();
  expect(() => renderHook(() => useIntegration())).toThrow(/IntegrationProvider/);
});

it('returns the provided integration', () => {
  const integration = createHostIntegration({ actions: [] });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <IntegrationProvider integration={integration}>{children}</IntegrationProvider>
  );

  expect(renderHook(() => useOptionalIntegration(), { wrapper }).result.current).toBe(integration);
  integration.dispose();
});
