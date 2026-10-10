/**
 * spaceUnits — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const spaceUnitsWebEndpoints = defineEndpoints('spaceUnits', {
  get: endpoint<{ unitId: string }, unknown>({ method: 'GET', path: (a) => path`/units/${a.unitId}` }),
  list: endpoint<{ spaceId: string }, unknown>({ method: 'GET', path: (a) => path`/spaces/${a.spaceId}/units` }),
  create: endpoint<{ spaceId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/spaces/${a.spaceId}/units` }),
  update: endpoint<{ spaceId: string; unitId: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/spaces/${a.spaceId}/units/${a.unitId}` }),
  remove: endpoint<{ spaceId: string; unitId: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/spaces/${a.spaceId}/units/${a.unitId}` }),
  assignMember: endpoint<{ spaceId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/spaces/${a.spaceId}/units/assign-member` }),
  activities: endpoint<{ unitId: string }, unknown>({ method: 'GET', path: (a) => path`/units/${a.unitId}/activities` }),
  addNote: endpoint<{ unitId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/units/${a.unitId}/activities` }),
});
