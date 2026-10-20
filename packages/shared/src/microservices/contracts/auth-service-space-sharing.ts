/** Message contracts for auth-service `space-sharing` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';

export type Level = 'VIEW' | 'CONTRIBUTE' | 'CONTROL';

export const spaceShareCreate = rpc<{
  ownerOrgId: string;
  createdById: string;
  spaceId: string;
  guestOrgCode: string; // the guest org's join code (secret) — resolves the target org
  level?: Level;
  showWorkers?: boolean;
  showAttendance?: boolean;
  showTracking?: boolean;
  showReports?: boolean;
  allowRequests?: boolean;
}>('space_share_create');
export const spaceShareUpdate = rpc<{
  ownerOrgId: string;
  shareId: string;
  level?: Level;
  showWorkers?: boolean;
  showAttendance?: boolean;
  showTracking?: boolean;
  showReports?: boolean;
  allowRequests?: boolean;
}>('space_share_update');
export const spaceShareRevoke = rpc<{ ownerOrgId: string; shareId: string }>('space_share_revoke');
export const spaceShareListForSpace = rpc<{ ownerOrgId: string; spaceId: string }>('space_share_list_for_space');
export const spaceShareListIncoming = rpc<{ guestOrgId: string }>('space_share_list_incoming');
export const spaceShareRespond = rpc<{ guestOrgId: string; shareId: string; accept: boolean; userId: string }>(
  'space_share_respond',
);
export const spaceShareRequestCreate = rpc<{
  guestOrgId: string;
  userId: string;
  shareId: string;
  type: 'TASK' | 'WORKER';
  title: string;
  note?: string;
}>('space_share_request_create');
export const spaceShareRequestList = rpc<{
  spaceId: string;
  ownerOrgId?: string;
  guestOrgId?: string;
  status?: string;
}>('space_share_request_list');
export const spaceShareRequestResolve = rpc<{
  ownerOrgId: string;
  requestId: string;
  approve: boolean;
  userId: string;
}>('space_share_request_resolve');

/**
 * A workspace is being removed for good (task-service's purge): auth-service drops what it owns
 * for that workspace — its portal intake categories and any share that is no longer ACTIVE.
 * An ACTIVE share is refused (the owner unshares first). Idempotent.
 */
export const spacePurgeAuthSide = rpc<
  { organizationId: string; spaceId: string },
  { success: boolean; message?: string; data?: { categoriesRemoved: number; sharesRemoved: number } }
>('space_purge_auth_side');
