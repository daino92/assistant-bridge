import { useEffect, useEffectEvent } from 'react';

import type { AssistantCommandHandler, EmbeddedAssistantOptions } from '@/assistant-client';
import { PROTOCOL_VERSION } from '@/contracts';

/** Registers a same-window receiver and unregisters it on replacement or unmount. */
export const useAssistantCommandHandler = (
  onCommand: AssistantCommandHandler,
  onReady?: EmbeddedAssistantOptions['onReady'],
): void => {
  const executeCommand = useEffectEvent(onCommand);

  useEffect(
    () => onReady?.((request) => executeCommand(request), { protocolVersion: PROTOCOL_VERSION }),
    [onReady],
  );
};
