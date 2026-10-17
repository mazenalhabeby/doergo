/**
 * spaceSharing — web-only routes (the browser's screens; the phone does not call them).
 * Read raw by apps/web-app/src/lib/api (`unwrap: 'raw'`), which types each answer
 * where it calls; `R` stays `unknown` here until a second app needs it.
 */
import { defineEndpoints, endpoint } from '../../core/define';
import { path } from '../../core/path';

export const spaceSharingWebEndpoints = defineEndpoints('spaceSharing', {
  listShares: endpoint<{ spaceId: string }, unknown>({
    method: 'GET',
    path: (a) => path`/locations/${a.spaceId}/shares`,
  }),
  createShare: endpoint<{ spaceId: string }, unknown, unknown>({
    method: 'POST',
    path: (a) => path`/locations/${a.spaceId}/shares`,
  }),
  updateShare: endpoint<{ spaceId: string; shareId: string }, unknown, unknown>({
    method: 'PATCH',
    path: (a) => path`/locations/${a.spaceId}/shares/${a.shareId}`,
  }),
  revokeShare: endpoint<{ spaceId: string; shareId: string }, unknown, unknown>({
    method: 'DELETE',
    path: (a) => path`/locations/${a.spaceId}/shares/${a.shareId}`,
  }),
  listShareRequests: endpoint<{ spaceId: string }, unknown>({
    method: 'GET',
    path: (a) => path`/locations/${a.spaceId}/share-requests`,
  }),
  resolveRequest: endpoint<{ requestId: string }, unknown, unknown>({
    method: 'PATCH',
    path: (a) => path`/share-requests/${a.requestId}/resolve`,
  }),
  listSharedSpaces: endpoint<void, unknown>({ method: 'GET', path: () => '/shared-spaces' }),
  respondToShare: endpoint<{ shareId: string }, unknown, unknown>({
    method: 'POST',
    path: (a) => path`/shared-spaces/${a.shareId}/respond`,
  }),
  createGuestRequest: endpoint<{ shareId: string }, unknown, unknown>({
    method: 'POST',
    path: (a) => path`/shared-spaces/${a.shareId}/requests`,
  }),
  listGuestRequests: endpoint<{ spaceId: string }, unknown>({
    method: 'GET',
    path: (a) => path`/shared-spaces/${a.spaceId}/requests`,
  }),
});
