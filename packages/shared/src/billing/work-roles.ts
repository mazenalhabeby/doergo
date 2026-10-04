/**
 * Work roles: a trade in a workspace that decides how somebody's work is billed.
 *
 * A workspace role is one of two kinds:
 *
 *   MANAGEMENT  Team Leader, Space Manager — carries PERMISSIONS. Every role that
 *               existed before work roles is this kind, so nothing that grants
 *               authority today changed meaning.
 *   WORK        Mechanic, Electrician — carries BILLING (hour, day or both, and a
 *               day rate per workspace). Grants nothing.
 *
 * ⚠️ A WORK ROLE GRANTS NOTHING, and that is what makes two roles per person
 * safe. Every permission, routing and notification check in the product reads
 * the assignment's `roleId` (the management role) and only that. The trade
 * lives in its own column, and its permissions are forced empty on every write,
 * so a second role can never become a second path to authority.
 */

export type RoleKindValue = 'WORK' | 'MANAGEMENT';
export type BillByValue = 'HOUR' | 'DAY' | 'BOTH';

export const ROLE_KINDS: readonly RoleKindValue[] = ['WORK', 'MANAGEMENT'] as const;
export const BILL_BY_VALUES: readonly BillByValue[] = ['HOUR', 'DAY', 'BOTH'] as const;

export function isRoleKind(v: unknown): v is RoleKindValue {
  return v === 'WORK' || v === 'MANAGEMENT';
}
export function isBillBy(v: unknown): v is BillByValue {
  return v === 'HOUR' || v === 'DAY' || v === 'BOTH';
}

/**
 * How this member is billed in this workspace.
 *
 * Their own choice first ("Mark: hours only"), then their work role's, then
 * HOUR — which is how everybody was billed before work roles existed, so a
 * member with no trade keeps exactly today's invoice.
 */
export function effectiveBillBy(
  assignmentBillBy: BillByValue | null | undefined,
  workRoleBillBy: BillByValue | null | undefined,
): BillByValue {
  return assignmentBillBy ?? workRoleBillBy ?? 'HOUR';
}

export const billsHours = (b: BillByValue) => b === 'HOUR' || b === 'BOTH';
export const billsDays = (b: BillByValue) => b === 'DAY' || b === 'BOTH';

/** Why a combination of roles on one assignment is refused, as a code the screens translate. */
export type RoleComboProblem =
  | 'WORK_ROLE_NOT_WORK' // the role offered as the trade is a management role
  | 'MANAGEMENT_ROLE_IS_WORK' // the role offered as the management role is a trade
  | 'SECOND_ROLE_NOT_ALLOWED' // both set, and this member is not allowed two
  | 'EXTERNAL_NO_WORK_ROLE'; // an external member is neither paid nor billed

/**
 * May this assignment hold these roles?
 *
 * One rule, read by the service (which refuses) and by the screen (which only
 * offers what would pass), so the button and the refusal cannot disagree.
 */
export function roleComboProblem(input: {
  workRoleKind?: RoleKindValue | null;
  managementRoleKind?: RoleKindValue | null;
  hasWorkRole: boolean;
  hasManagementRole: boolean;
  allowSecondRole: boolean;
  isExternal: boolean;
}): RoleComboProblem | null {
  if (input.hasWorkRole && input.workRoleKind !== 'WORK') return 'WORK_ROLE_NOT_WORK';
  if (input.hasManagementRole && input.managementRoleKind === 'WORK') return 'MANAGEMENT_ROLE_IS_WORK';
  if (input.hasWorkRole && input.isExternal) return 'EXTERNAL_NO_WORK_ROLE';
  if (input.hasWorkRole && input.hasManagementRole && !input.allowSecondRole) return 'SECOND_ROLE_NOT_ALLOWED';
  return null;
}

export const ROLE_COMBO_MESSAGES: Record<RoleComboProblem, string> = {
  WORK_ROLE_NOT_WORK: 'That role is a management role, not a work role',
  MANAGEMENT_ROLE_IS_WORK: 'That role is a work role, not a management role',
  SECOND_ROLE_NOT_ALLOWED: 'This member is not allowed a second role here — switch "Allow a second role" on first',
  EXTERNAL_NO_WORK_ROLE: 'An external member cannot hold a work role — they are not billed or paid by you',
};

/**
 * The days somebody worked at a workspace: every distinct day they clocked in
 * there, read in the workspace's own time zone.
 *
 * ⚠️ ANY CLOCK-IN COUNTS, with no minimum hours — that is the agreed rule. A
 * shift that starts at 23:30 counts for the day it started on, and two shifts on
 * one day are one day.
 *
 * `inDay` decides the period (inclusive keys); the caller passes entries already
 * narrowed by the database to roughly the right window.
 */
export function workedDays(
  clockIns: Array<{ clockInAt: Date | string }>,
  dayKeyOf: (at: Date) => string,
  fromDay?: string | null,
  toDay?: string | null,
): string[] {
  const days = new Set<string>();
  for (const e of clockIns) {
    const key = dayKeyOf(new Date(e.clockInAt));
    if (fromDay && key < fromDay) continue;
    if (toDay && key > toDay) continue;
    days.add(key);
  }
  return [...days].sort();
}

/**
 * A work role's permissions, whatever was sent: none.
 *
 * Applied on create AND on update, so a role cannot become a trade while
 * keeping the permissions it had as a management role.
 */
export function permissionsForKind(kind: RoleKindValue, requested: Record<string, boolean>): Record<string, boolean> {
  return kind === 'WORK' ? {} : requested;
}
