import { useEffect, useState } from 'react';

import type { HostContext } from '@/contracts';
import { useAssistantHost } from '@/react/context';

/**
 * Publishes entities of the calling page component (for example the open record) while it is
 * mounted, merged with other components' entities in mount order and removed on unmount.
 * Updates follow the entities' content, not their identity, so inline arrays are fine.
 * Outside `AssistantHost` it does nothing. Publish only data the user may see.
 */
export const usePageEntities = (entities: NonNullable<HostContext['entities']>) => {
  const host = useAssistantHost();
  const publish = host?.publishPageEntities;
  const [owner] = useState(() => Symbol('page-entities'));
  const fingerprint = JSON.stringify(entities);

  useEffect(() => {
    if (!publish) {
      return undefined;
    }

    publish(owner, JSON.parse(fingerprint) as NonNullable<HostContext['entities']>);

    return () => publish(owner, null);
  }, [fingerprint, owner, publish]);
};
