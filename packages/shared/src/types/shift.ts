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
  shiftCrossesMidnight,
  type ShiftAssignment,
  type CreateShiftAssignmentInput,
} from './shift-parts/shifts';
export {
  SPACE_ROLE_PERMISSION_SCHEMA,
  type SpaceRolePermissions,
  type SpaceRole,
  type SpaceRoleInSpace,
  type SpaceMember,
} from './shift-parts/space-roles';
