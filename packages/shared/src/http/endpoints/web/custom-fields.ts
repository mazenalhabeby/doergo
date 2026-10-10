/**
 * customFields — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const customFieldsWebEndpoints = defineEndpoints('customFields', {
  listDefinitions: endpoint<void, unknown>({ method: 'GET', path: () => '/custom-fields' }),
  createDefinition: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/custom-fields' }),
  updateDefinition: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/custom-fields/${a.id}` }),
  deleteDefinition: endpoint<{ id: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/custom-fields/${a.id}` }),
});
