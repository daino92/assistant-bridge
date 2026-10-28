import { useEffect, useEffectEvent, useRef, type ComponentPropsWithoutRef } from 'react';

import { createAssistantIframeUrl, type AssistantConnectionOptions } from '@/connections';
import { useIntegration } from '@/react/context';

export interface AssistantIframeProps
  extends
    Omit<ComponentPropsWithoutRef<'iframe'>, 'src' | 'srcDoc' | 'children'>,
    AssistantConnectionOptions {
  url: string;
  title: string;
}

/** Host-styled iframe with SDK-owned initialization and connection cleanup. */
const AssistantIframe = ({
  url,
  onStatus,
  timeoutMs,
  assistantId,
  ...iframeProps
}: AssistantIframeProps) => {
  const integration = useIntegration();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const src = createAssistantIframeUrl(url, window.location.origin);

  const reportStatus = useEffectEvent(onStatus);

  useEffect(() => {
    if (!frameRef.current) {
      return;
    }

    return integration.connectIframe({
      iframe: frameRef.current,
      url: src,
      onStatus: (status) => reportStatus(status),
      timeoutMs,
      assistantId,
    });
  }, [integration, src, timeoutMs, assistantId]);

  return <iframe {...iframeProps} ref={frameRef} src={src} />;
};

export default AssistantIframe;
