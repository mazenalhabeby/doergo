/**
 * What every part of member management shares: the row shapes the lists and
 * detail pages read, and the small pure helpers more than one of them needs.
 */
import { randomInt } from 'crypto';

export const BCRYPT_COST_FACTOR = 12;

// Single source of truth for the fields the Members list + a single member share,
// so a member detail page can fetch ONE row in the same shape as a list row
// (instead of pulling the whole org and finding it client-side).
/**
 * The directory projection: who a person is, not what they may do.
 *
 * The dashboard pages through EVERY member on a 60-second interval to refresh
 * presence, and was pulling the full member row to do it — the Access Profile
 * JSON, the contact allow-list array, the role join and a dozen permission
 * columns, none of which it reads. For a few hundred staff that is the heaviest
 * repeating query in the product, and all but a handful of fields were dropped
 * on arrival.
 */
export const DIRECTORY_MEMBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  position: true,
  isActive: true,
  presence: true,
  lastActiveAt: true,
  specialty: true,
  canManageUsers: true,
  canViewAllTasks: true,
  // The two fields a people-picker needs to say WHICH person this is.
  // `email` is the only thing that separates two accounts belonging to the same
  // human — a real case here, and the reason a document was once routed to a
  // login nobody was signed into. `memberRole` is the label when nobody typed a
  // job title. Both are cheap: a scalar already on the row, and one small join.
  email: true,
  memberRole: { select: { name: true } },
} as const;

/** Just enough to draw one row of a manager picker. */
export const MANAGER_CANDIDATE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  position: true,
  isActive: true,
  canManageUsers: true,
  // The role is what the UI labels the row with. A permission written directly
  // on the user row is why someone can appear here while their role is not a
  // managing one — showing the role keeps the label honest about that.
  memberRole: { select: { name: true, permissions: true } },
} as const;

export const ORG_MEMBER_SELECT = {
  id: true,
  employerEntityId: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  avatarUrl: true,
  createdAt: true,
  position: true,
  presence: true,
  scheduleType: true,
  monthlyHourBudget: true,
  enabledModules: true,
  specialty: true,
  employmentType: true,
  maxDailyJobs: true,
  leaveAllowance: true,
  employmentStartDate: true,
  dateOfBirth: true,
  canCreateTasks: true,
  taskCreationScope: true,
  canViewAllTasks: true,
  canAssignTasks: true,
  canManageUsers: true,
  canViewReports: true,
  allowRemote: true,
  contactable: true,
  contactScope: true,
  contactAllowedIds: true,
  showInManagement: true,
  lastActiveAt: true,
  memberRoleId: true,
  memberRole: { select: { id: true, name: true, color: true } },
  // Badged in every member list, so it belongs in the shared select rather
  // than being added per screen and forgotten on one.
  isExternal: true,
} as const;

/** How far a task-creation scope reaches, for the grant ceiling. */
export const TASK_CREATION_SCOPE_RANK: Record<string, number> = { NONE: 0, SELF: 1, SPACE: 2, ORG: 3 };

// ── Small helpers shared by more than one part of member management ────────

export function isOnline(lastUpdate: Date | null | undefined): boolean {
  if (!lastUpdate) return false;
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return lastUpdate.getTime() > fiveMinutesAgo;
}

export function generateRandomPassword(): string {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  // crypto.randomInt, not Math.random: this string is a credential handed
  // out by an admin reset, and Math.random is predictable from its outputs.
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(randomInt(chars.length));
  }
  return password;
}
