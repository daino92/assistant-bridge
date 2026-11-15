import { useEffect, useEffectEvent } from 'react';

import { connectAssistantIframe, type AssistantIframeConnectionOptions } from '@/connections';

export interface UseAssistantIframeConnectionOptions extends Pick<
  AssistantIframeConnectionOptions,
  'onCommand' | 'onClient'
> {
  /** The parent origin to connect to, when the chat knows it. */
  hostOrigin?: string;
  /**
   * Parent origins the chat trusts. The `hostOrigin` query parameter, which `AssistantIframe`
   * adds to the chat URL, is used only when it is one of these. Without a list, the parameter is
   * ignored: any page could frame the chat and name itself as the host.
   */
  allowedOrigins?: readonly string[];
  enabled?: boolean;
}

/** The parent origin to trust: an explicit one, or the query parameter if it is allowed. */
const trustedOrigin = (
  hostOrigin: string | undefined,
  allowedOrigins: readonly string[] | undefined,
): string | undefined => {
  if (hostOrigin) {
    return hostOrigin;
  }

  const requested = new URLSearchParams(window.location.search).get('hostOrigin');

  return requested && allowedOrigins?.includes(requested) ? requested : undefined;
};

/** Assistant-side connection only. A supplied client should disable this hook. */
export const useAssistantIframeConnection = ({
  hostOrigin,
  allowedOrigins,
  enabled = true,
  onCommand,
  onClient,
}: UseAssistantIframeConnectionOptions): void => {
  const executeCommand = useEffectEvent(onCommand);

  const changeClient = useEffectEvent(onClient);

  useEffect(() => {
    const origin = trustedOrigin(hostOrigin, allowedOrigins);

    if (!enabled || !origin) {
      return;
    }

    return connectAssistantIframe({
      hostOrigin: origin,
      onCommand: (request) => executeCommand(request),
      onClient: (client) => changeClient(client),
    });
    // The list's content, not its identity, decides; an inline array does not reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hostOrigin, allowedOrigins?.join('\n')]);
};
