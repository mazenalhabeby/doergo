/**
 * PERSONAL ROLES — one person's permissions in one workspace, built in the
 * permission builder (docs/plans/external-role-builder.md).
 *
 * Stored as an ordinary AccessRole owned by one SpaceAssignment
 * (`AccessRole.personalAssignmentId`), so every rule that reads a role applies
 * to it unchanged. What makes it personal is that NOBODY ELSE may hold it and
 * nobody may pick it: every role list, picker and "may I assign this role"
 * lookup must exclude it, or a person's private grant becomes a role anybody
 * can hand out.
 */

/** Prisma `where` fragment: roles anyone may list, pick or assign (never a personal one). */
export const SHARED_ROLE_WHERE = { personalAssignmentId: null } as const;

/** The stable slug of an assignment's personal role (unique per organization because the assignment id is). */
export function personalRoleSlug(assignmentId: string): string {
  return `personal-${assignmentId}`;
}

/**
 * May this role be put on this assignment? A shared role, or this assignment's
 * OWN personal role — never another person's.
 */
export function roleUsableOnAssignment(
  role: { personalAssignmentId?: string | null } | null | undefined,
  assignmentId: string | null | undefined,
): boolean {
  if (!role) return false;
  return !role.personalAssignmentId || role.personalAssignmentId === assignmentId;
}
