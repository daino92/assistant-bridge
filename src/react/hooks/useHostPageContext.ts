import { useEffect } from 'react';

import type { HostIntegration, UpdatePageOptions } from '@/create-host-integration';
import type { HostContext } from '@/contracts';

export type HostPageContextOptions = UpdatePageOptions;

const EMPTY_ENTITIES: NonNullable<HostContext['entities']> = [];

/** The manager owns equality, revisions and atomic updates; React only synchronizes inputs. */
export const useHostPageContext = (
  integration: HostIntegration,
  {
    route,
    page,
    selection = 'clear',
    entities = EMPTY_ENTITIES,
    destinations,
    principal,
  }: HostPageContextOptions,
) => {
  useEffect(() => {
    integration.updatePage({ route, page, selection, entities, destinations, principal });
  }, [integration, route, page, selection, entities, destinations, principal]);
};
