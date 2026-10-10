/**
 * spacePortal — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const spacePortalWebEndpoints = defineEndpoints('spacePortal', {
  listPortals: endpoint<{ spaceId: string }, unknown>({ method: 'GET', path: (a) => path`/spaces/${a.spaceId}/portal/portals` }),
  createPortal: endpoint<{ spaceId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/spaces/${a.spaceId}/portal/portals` }),
  get: endpoint<{ spaceId: string }, unknown>({ method: 'GET', path: (a) => path`/spaces/${a.spaceId}/portal` }),
  setEntityType: endpoint<{ spaceId: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/spaces/${a.spaceId}/portal` }),
  units: endpoint<{ spaceId: string }, unknown>({ method: 'GET', path: (a) => path`/spaces/${a.spaceId}/portal/units` }),
  addUnit: endpoint<{ spaceId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/spaces/${a.spaceId}/portal/units` }),
  deleteUnit: endpoint<{ spaceId: string; unitId: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/spaces/${a.spaceId}/portal/units/${a.unitId}` }),
  assign: endpoint<{ spaceId: string; unitId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/spaces/${a.spaceId}/portal/units/${a.unitId}/assign` }),
});
