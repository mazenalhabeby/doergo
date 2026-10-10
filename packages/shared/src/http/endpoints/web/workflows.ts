/**
 * workflows — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const workflowsWebEndpoints = defineEndpoints('workflows', {
  libraryList: endpoint<void, unknown>({ method: 'GET', path: () => '/workflows/library' }),
  libraryUse: endpoint<{ templateId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/workflows/library/${a.templateId}` }),
  listForSpace: endpoint<{ spaceId: string }, unknown>({ method: 'GET', path: (a) => path`/workflows/spaces/${a.spaceId}` }),
  attachToSpace: endpoint<{ spaceId: string; workflowId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/workflows/spaces/${a.spaceId}/${a.workflowId}` }),
  detachFromSpace: endpoint<{ spaceId: string; workflowId: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/workflows/spaces/${a.spaceId}/${a.workflowId}` }),
  forkForSpace: endpoint<{ spaceId: string; workflowId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/workflows/spaces/${a.spaceId}/${a.workflowId}/fork` }),
  shareWithOrganization: endpoint<{ workflowId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/workflows/${a.workflowId}/share-with-organization` }),
  setSpaceDefault: endpoint<{ spaceId: string; workflowId: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/workflows/spaces/${a.spaceId}/${a.workflowId}/default` }),
  list: endpoint<void, unknown>({ method: 'GET', path: () => '/workflows' }),
  getById: endpoint<{ id: string }, unknown>({ method: 'GET', path: (a) => path`/workflows/${a.id}` }),
  create: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/workflows' }),
  submitToLibrary: endpoint<{ id: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/workflows/${a.id}/submit-to-library` }),
  update: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/workflows/${a.id}` }),
  addStatus: endpoint<{ workflowId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/workflows/${a.workflowId}/statuses` }),
  updateStatus: endpoint<{ workflowId: string; statusId: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/workflows/${a.workflowId}/statuses/${a.statusId}` }),
  deleteStatus: endpoint<{ workflowId: string; statusId: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/workflows/${a.workflowId}/statuses/${a.statusId}` }),
});
