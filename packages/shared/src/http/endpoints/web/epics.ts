/**
 * epics — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const epicsWebEndpoints = defineEndpoints('epics', {
  list: endpoint<void, unknown>({ method: 'GET', path: () => '/epics' }),
  create: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/epics' }),
  update: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/epics/${a.id}` }),
});
