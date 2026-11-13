import { useEffect, useState } from 'react';

import type { AssistantBridgeClient } from '@/assistant-client';
import type { HostContext } from '@/contracts';

export const useAssistantContext = (client?: AssistantBridgeClient): HostContext | undefined => {
  const [context, setContext] = useState<HostContext | undefined>(() => client?.getContext());

  useEffect(() => {
    setContext(client?.getContext());

    return client?.subscribeContext(setContext);
  }, [client]);

  return context;
};
