import { useCallback, useEffect, useState } from 'react';

import { ASSISTANT_COMMAND_NAMES } from '@/contracts';
import type { AssistantConnectionStatus } from '@/connections';
import { useIntegration } from '@/react/context';

/** Headless panel state. Rendering, availability controls and connection adapters stay host-owned. */
export const useAssistantPanel = () => {
  const { bridge } = useIntegration();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AssistantConnectionStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  const openPanel = useCallback(() => setOpen(true), []);

  const closePanel = useCallback(() => {
    setOpen(false);
    void bridge.sendAssistantCommand(ASSISTANT_COMMAND_NAMES.CLOSE, {}).catch(() => {});
  }, [bridge]);

  const onStatus = useCallback((next: AssistantConnectionStatus) => setStatus(next), []);

  const reconnect = useCallback(() => {
    setStatus('loading');
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    return bridge.bus.on('assistant.command.request', (request) => {
      setOpen(request.command !== ASSISTANT_COMMAND_NAMES.CLOSE);
    });
  }, [bridge]);

  return { open, openPanel, closePanel, status, onStatus, attempt, reconnect };
};
