/**
 * recurringTasks — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const recurringTasksWebEndpoints = defineEndpoints('recurringTasks', {
  list: endpoint<void, unknown>({ method: 'GET', path: () => '/recurring-tasks' }),
  create: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/recurring-tasks' }),
  update: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/recurring-tasks/${a.id}` }),
  delete: endpoint<{ id: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/recurring-tasks/${a.id}` }),
  generate: endpoint<{ id: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/recurring-tasks/${a.id}/generate` }),
});
