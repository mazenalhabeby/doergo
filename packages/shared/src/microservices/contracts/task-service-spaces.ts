/** task-service: workspaces — lists, one workspace, modules, rosters, colleagues; releasing a share; a member leaving. */
import { rpc } from '../contract';
import type { AuthServiceReply } from './auth-service-replies';

export const memberOffboard = rpc<{ organizationId: string; userId: string; actorId: string; erase?: boolean }>(
  'member_offboard',
);

export const spaceShareRelease = rpc<{ ownerOrgId: string; spaceId: string; guestOrgId: string }>(
  'space_share_release',
);

export const findAllLocations = rpc<{
  organizationId: string;
  page?: number;
  limit?: number;
  includeInactive?: boolean;
  search?: string;
  kind?: string;
  viewerId?: string;
  spaceScope?: 'own' | 'tasks' | 'all';
}>('find_all_locations');

export const findOneLocation = rpc<{
  id: string;
  organizationId: string;
  sharedSpaceIds?: string[];
  viewScopeSpaceIds?: string[] | null;
  mayManage?: boolean;
}>('find_one_location');

export const getEffectiveModules = rpc<
  { id: string; organizationId: string },
  AuthServiceReply<{ enabledModules?: unknown }>
>('get_effective_modules');

export const getLocationAssignments = rpc<{
  locationId: string;
  organizationId: string;
  sharedSpaceIds?: string[];
  requesterId?: string;
  spaceScope?: string;
  canViewAll?: boolean;
}>('get_location_assignments');

export const getLocationAssignmentsBatch = rpc<{
  locationIds: string[];
  organizationId: string;
  requesterId?: string;
  spaceScope?: string;
  canViewAll?: boolean;
  viewAllIds?: string[];
}>('get_location_assignments_batch');

export const getTechnicianAssignments = rpc<{
  userId: string;
  organizationId: string;
  /** Workspaces the caller holds the permission in; undefined = org-wide, [] = nowhere. */
  scopeSpaceIds?: string[];
}>('get_technician_assignments');

export const getColleagues = rpc<{ userId: string; organizationId: string; spaceScope?: 'own' | 'tasks' | 'all' }>(
  'get_colleagues',
);

/** A member deleting their account: task-service erases what is theirs across organizations (their comments). Idempotent. */
export const taskEraseMember = rpc<{ userId: string }, { success: boolean; data?: { commentsRemoved: number } }>(
  'task_erase_member',
);
