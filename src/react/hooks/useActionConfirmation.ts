import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { createActionConfirmationController } from '@/assistant-client';

const getServerSnapshot = () => undefined;

/** React only renders the core controller state; confirmation lifecycle stays in the core SDK. */
export const useActionConfirmation = () => {
  const [controller] = useState(createActionConfirmationController);
  const generation = useRef(0);

  const confirmation = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    getServerSnapshot,
  );

  const approve = useCallback(() => {
    if (confirmation) {
      controller.approve(confirmation.id);
    }
  }, [controller, confirmation]);

  const reject = useCallback(() => {
    if (confirmation) {
      controller.reject(confirmation.id);
    }
  }, [controller, confirmation]);

  useEffect(() => {
    generation.current += 1;

    return () => {
      controller.cancel();

      const unmountGeneration = ++generation.current;

      // Strict Mode replays setup before this microtask; only final unmount disposes the controller.
      queueMicrotask(() => {
        if (generation.current === unmountGeneration) {
          controller.dispose();
        }
      });
    };
  }, [controller]);

  return { confirmation, requestConfirmation: controller.requestConfirmation, approve, reject };
};
