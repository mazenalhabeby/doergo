/**
 * portalAdmin — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const portalAdminWebEndpoints = defineEndpoints('portalAdmin', {
  listPortals: endpoint<void, unknown>({ method: 'GET', path: () => '/portal/admin/portals' }),
  createPortal: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/portal/admin/portals' }),
  getPortal: endpoint<{ id: string }, unknown>({ method: 'GET', path: (a) => path`/portal/admin/portals/${a.id}` }),
  updatePortal: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/portal/admin/portals/${a.id}` }),
  deletePortal: endpoint<{ id: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/portal/admin/portals/${a.id}` }),
  createCategory: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/portal/admin/categories' }),
  updateCategory: endpoint<{ id: string }, unknown, unknown>({ method: 'PATCH', path: (a) => path`/portal/admin/categories/${a.id}` }),
  deleteCategory: endpoint<{ id: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/portal/admin/categories/${a.id}` }),
  reorderCategories: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/portal/admin/categories/reorder' }),
  residents: endpoint<void, unknown>({ method: 'GET', path: () => '/portal/admin/residents' }),
  availableUnits: endpoint<{ portalId: string }, unknown>({ method: 'GET', path: (a) => path`/portal/admin/portals/${a.portalId}/available-units` }),
  availableCustomers: endpoint<{ portalId: string }, unknown>({ method: 'GET', path: (a) => path`/portal/admin/portals/${a.portalId}/available-customers` }),
  inviteResident: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/portal/admin/residents' }),
  resendInvite: endpoint<{ customerId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/portal/admin/residents/${a.customerId}/resend-invite` }),
  removeResident: endpoint<{ customerId: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/portal/admin/residents/${a.customerId}` }),
  listUnits: endpoint<void, unknown>({ method: 'GET', path: () => '/portal/admin/units' }),
  createUnit: endpoint<void, unknown, unknown>({ method: 'POST', path: () => '/portal/admin/units' }),
  deleteUnit: endpoint<{ id: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/portal/admin/units/${a.id}` }),
  requests: endpoint<void, unknown>({ method: 'GET', path: () => '/portal/admin/requests' }),
  portalRequests: endpoint<{ portalId: string }, unknown>({ method: 'GET', path: (a) => path`/portal/admin/portals/${a.portalId}/requests` }),
  triageRequest: endpoint<{ requestId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/portal/admin/requests/${a.requestId}/triage` }),
  uploadCover: endpoint<{ portalId: string }, unknown, unknown>({ method: 'POST', path: (a) => path`/portal/admin/portals/${a.portalId}/cover`, upload: true }),
  removeCover: endpoint<{ portalId: string }, unknown, unknown>({ method: 'DELETE', path: (a) => path`/portal/admin/portals/${a.portalId}/cover` }),
});
