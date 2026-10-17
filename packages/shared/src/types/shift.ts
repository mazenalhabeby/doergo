/**
 * Shared Shift-Scheduling Types (space-centric attendance)
 *
 * These types back the shift resolver, the reminder engine, and the dynamic
 * per-space sub-role system. Import from '@hbcfield/shared' — never redefine
 * in web/mobile.
 */

export {
  type Shift,
  type CreateShiftInput,
  type UpdateShiftInput,
  shiftCrossesMidnight,
  type ShiftAssignment,
  type CreateShiftAssignmentInput,
  type UpdateShiftAssignmentInput,
} from './shift-parts/shifts';
export {
  SPACE_ROLE_PERMISSION_SCHEMA,
  type SpaceRolePermissionKey,
  type SpaceRolePermissions,
  type SpaceRole,
  type SpaceRoleInSpace,
  type SpaceMember,
  BUILTIN_SPACE_ROLES,
  WORK_MODEL_LABELS,
  SHIFT_REMINDER_STATE_LABELS,
} from './shift-parts/space-roles';
