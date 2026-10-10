/**
 * legalEntities — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const legalEntitiesWebEndpoints = defineEndpoints('legalEntities', {
  list: endpoint<void, unknown>({ method: 'GET', path: () => '/legal-entities' }),
  create: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/legal-entities' }),
  update: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/legal-entities/${a.id}` }),
  setMain: endpoint<{ id: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/legal-entities/${a.id}/main` }),
  setActive: endpoint<{ id: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/legal-entities/${a.id}/reactivate` }),
  setActivePost: endpoint<{ id: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/legal-entities/${a.id}/deactivate` }),
});
