/** task-service misc-1 handlers — contracts (request types are what the handler reads). */
import { rpc } from '../contract';
import type { TaskSearchInput } from './task-service-1-types';
import type { SpaceScopeIds } from '../../access/space-scope';

export const getAttachments = rpc<{ taskId: string; userId: string; userRole: string; organizationId: string }>(
  'get_attachments',
);
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
export const getEffectiveModules = rpc<{ id: string; organizationId: string }>('get_effective_modules');
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
export const getTechnicianAssignments = rpc<
  { userId: string; organizationId: string } & {
    /** ⚠️ sent by the gateway, never read by the service: the narrowing is not applied */ scopeSpaceIds?: string[];
  }
>('get_technician_assignments');
export const getColleagues = rpc<{ userId: string; organizationId: string; spaceScope?: 'own' | 'tasks' | 'all' }>(
  'get_colleagues',
);
export const searchTasksAndSpaces = rpc<TaskSearchInput>('search_tasks_and_spaces');
export const listShifts = rpc<{ organizationId: string; spaceId?: string; scopeSpaceIds?: SpaceScopeIds }>(
  'list_shifts',
);
export const createShift = rpc<{
  scopeSpaceIds?: SpaceScopeIds;
  organizationId: string;
  spaceId?: string | null;
  name: string;
  description?: string;
  color?: string;
  startLocal: string;
  endLocal: string;
  breakMinutes?: number;
  graceMin?: number;
  reminderIntervalMin?: number;
  maxReminders?: number;
  flagToleranceMin?: number;
}>('create_shift');
export const updateShift = rpc<{
  scopeSpaceIds?: SpaceScopeIds;
  organizationId: string;
  shiftId: string;
  name?: string;
  description?: string;
  color?: string;
  startLocal?: string;
  endLocal?: string;
  breakMinutes?: number;
  graceMin?: number;
  reminderIntervalMin?: number;
  maxReminders?: number;
  flagToleranceMin?: number;
  isActive?: boolean;
}>('update_shift');
export const deleteShift = rpc<{ organizationId: string; shiftId: string; scopeSpaceIds?: SpaceScopeIds }>(
  'delete_shift',
);
export const weekRota = rpc<{
  organizationId: string;
  viewScope?: SpaceScopeIds;
  editScope?: SpaceScopeIds;
  spaceId?: string;
  from?: string;
}>('week_rota');
export const setRotaDay = rpc<{
  organizationId: string;
  editScope?: SpaceScopeIds;
  spaceId: string;
  userId: string;
  date: string;
  shiftId: string | null;
  repeat: 'once' | 'weekly';
  createdById?: string;
}>('set_rota_day');
export const listShiftAssignments = rpc<{
  organizationId: string;
  spaceId: string;
  includeEnded?: boolean;
  scopeSpaceIds?: SpaceScopeIds;
}>('list_shift_assignments');
export const createShiftAssignment = rpc<{
  scopeSpaceIds?: SpaceScopeIds;
  organizationId: string;
  spaceId: string;
  userId: string;
  shiftId: string;
  recurrence: string;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  dates?: string[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  priority?: number;
  createdById?: string;
}>('create_shift_assignment');
export const updateShiftAssignment = rpc<{
  scopeSpaceIds?: SpaceScopeIds;
  organizationId: string;
  assignmentId: string;
  shiftId?: string;
  recurrence?: string;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  dates?: string[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  priority?: number;
  isActive?: boolean;
  actorId?: string;
}>('update_shift_assignment');
export const deleteShiftAssignment = rpc<{
  organizationId: string;
  assignmentId: string;
  scopeSpaceIds?: SpaceScopeIds;
}>('delete_shift_assignment');
export const getActiveOvertime = rpc<{ userId: string }>('get_active_overtime');
export const getPendingOvertimeApprovals = rpc<{ organizationId: string; scopeSpaceIds?: SpaceScopeIds }>(
  'get_pending_overtime_approvals',
);
export const getOvertimeHistory = rpc<{
  organizationId: string;
  scopeSpaceIds?: SpaceScopeIds;
  technicianId?: string;
  spaceId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}>('get_overtime_history');
export const getOvertimeSummary = rpc<{
  organizationId: string;
  scopeSpaceIds?: SpaceScopeIds;
  technicianId?: string;
  spaceId?: string;
  from?: string;
  to?: string;
}>('get_overtime_summary');
export const getOvertimeRound = rpc<{ id: string; organizationId: string; scopeSpaceIds?: SpaceScopeIds }>(
  'get_overtime_round',
);
export const findAllRecurringTasks = rpc<{
  organizationId: string;
  limit?: number;
  offset?: number;
  scopeSpaceIds?: string[];
}>('find_all_recurring_tasks');
export const createRecurringTask = rpc<{
  title: string;
  description?: string;
  priority?: string;
  spaceId?: string;
  workflowId?: string;
  customerId?: string;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assigneeIds?: string[];
  estimatedHours?: number;
  checklist?: { text: string }[];
  frequency: string;
  customDays?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
  organizationId: string;
  createdById: string;
}>('create_recurring_task');
export const updateRecurringTask = rpc<{
  id: string;
  organizationId: string;
  title?: string;
  description?: string;
  priority?: string;
  spaceId?: string | null;
  workflowId?: string | null;
  customerId?: string | null;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assigneeIds?: string[];
  estimatedHours?: number;
  checklist?: { text: string }[];
  frequency?: string;
  customDays?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  endDate?: string;
  isActive?: boolean;
}>('update_recurring_task');
export const deleteRecurringTask = rpc<{ id: string; organizationId: string }>('delete_recurring_task');
