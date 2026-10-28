import { useMemo } from 'react';

import { useIntegration } from '@/react/context';

export const useAskAi = () => {
  const { assistantCommands } = useIntegration();

  return useMemo(
    () => ({
      askAbout: assistantCommands.askAbout,
      prefillOnly: assistantCommands.prefillAndOpen,
    }),
    [assistantCommands],
  );
};
