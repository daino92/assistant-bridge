import { useEffect, useEffectEvent } from 'react';

import { connectAssistantIframe, type AssistantIframeConnectionOptions } from '@/connections';

export interface UseAssistantIframeConnectionOptions extends Pick<
  AssistantIframeConnectionOptions,
  'onCommand' | 'onClient'
> {
  hostOrigin?: string;
  enabled?: boolean;
}

/** Assistant-side connection only. A supplied client should disable this hook. */
export const useAssistantIframeConnection = ({
  hostOrigin,
  enabled = true,
  onCommand,
  onClient,
}: UseAssistantIframeConnectionOptions): void => {
  const executeCommand = useEffectEvent(onCommand);

  const changeClient = useEffectEvent(onClient);

  useEffect(() => {
    const origin = hostOrigin ?? new URLSearchParams(window.location.search).get('hostOrigin');

    if (!enabled || !origin) {
      return;
    }

    return connectAssistantIframe({
      hostOrigin: origin,
      onCommand: (request) => executeCommand(request),
      onClient: (client) => changeClient(client),
    });
  }, [enabled, hostOrigin]);
};
