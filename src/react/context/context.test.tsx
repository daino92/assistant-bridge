import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { createIntegration } from '@/create-host-integration';
import IntegrationProvider from '@/react/IntegrationProvider';
import { useIntegration, useOptionalIntegration } from '@/react/context';

it('returns null outside IntegrationProvider while useIntegration still throws', () => {
  expect(renderHook(() => useOptionalIntegration()).result.current).toBeNull();
  expect(() => renderHook(() => useIntegration())).toThrow(/IntegrationProvider/);
});

it('returns the provided integration', () => {
  const integration = createIntegration({ actions: [] });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <IntegrationProvider integration={integration}>{children}</IntegrationProvider>
  );

  expect(renderHook(() => useOptionalIntegration(), { wrapper }).result.current).toBe(integration);
  integration.dispose();
});
