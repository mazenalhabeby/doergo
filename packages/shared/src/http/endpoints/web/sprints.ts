/**
 * sprints — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const sprintsWebEndpoints = defineEndpoints('sprints', {
  list: endpoint<void, unknown>({ method: 'GET', path: () => '/sprints' }),
  create: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/sprints' }),
  update: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/sprints/${a.id}` }),
  start: endpoint<{ id: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/sprints/${a.id}/start` }),
  complete: endpoint<{ id: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/sprints/${a.id}/complete` }),
  delete: endpoint<{ id: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/sprints/${a.id}` }),
  getVelocity: endpoint<void, unknown>({ method: 'GET', path: () => '/sprints/velocity' }),
});
