/** task-service: shifts, the week's rota and shift assignments. */
import { rpc } from '../contract';
import type { SpaceScopeIds } from '../../access/space-scope';

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
