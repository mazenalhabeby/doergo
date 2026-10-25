/** The Access Profile read from a member: modules, workspaces, platforms, contacts. */
/*
  Aliased: this file exports its OWN `ResolvedAccess` (platforms / spaceScope /
  canContact — the Access Profile), which is a different thing from the
  permissions module's (org + perSpace grants). Two exported types share the
  name across this package; importing one into the other needs the alias until
  somebody renames one, which is a wider change than this.
*/
import { accessAllowsAnywhere, type ResolvedAccess as PermissionGrants } from '../permissions';
import { EXTERNAL_FORBIDDEN_MODULES, type MobileModule } from './mobile';

// ── Access Profile ───────────────────────────────────────────────────────────
// A per-user, fully-configurable access model stored in `User.enabledModules`.
// Two storage forms are supported (back-compat):
//   • array  → ["tasks","clock"]              (legacy / org-level default)
//   • object → { modules, spaceScope, ... }   (per-user Access Profile)
// All helpers below transparently read either form.

/** How much of the org's spaces a user can see. */
export type SpaceScope = 'own' | 'tasks' | 'all';

/** Which platforms a user may sign in to. */
export type AccessPlatform = 'web' | 'mobile' | 'both';

export interface AccessProfile {
  modules: MobileModule[]; // mobile tabs / home modules
  spaceScope?: SpaceScope; // space visibility
  platforms?: AccessPlatform; // web / mobile / both
  canContact?: boolean; // can message & call colleagues
}

function asProfile(em: unknown): AccessProfile | null {
  if (em && typeof em === 'object' && !Array.isArray(em)) return em as AccessProfile;
  return null;
}

/** Resolve a user's modules array regardless of storage form. */
export function getModules(user: { enabledModules?: unknown }): MobileModule[] {
  const em = user.enabledModules;
  const profile = asProfile(em);
  if (profile) return Array.isArray(profile.modules) ? profile.modules : [];
  return Array.isArray(em) ? (em as MobileModule[]) : [];
}

// ── FEATURE modules (org/space) — distinct from the access modules above. ──
// These are the AVAILABLE_MODULES task features (sprints, checklists, tracking…).
// They live on the Organization/Space (carried on the user as `orgModules`),
// NEVER on the per-user Access Profile, so they apply to every user equally.

/** Org-level feature modules the user inherits (sprints, checklists, …). */
export function getFeatureModules(user: { orgModules?: string[] | null }): string[] {
  return Array.isArray(user.orgModules) ? user.orgModules : [];
}

/** Whether a FEATURE module is enabled at the org level for this user. */
export function hasFeatureModule(user: { orgModules?: string[] | null }, key: string): boolean {
  return getFeatureModules(user).includes(key);
}

/** Default feature modules for a brand-new organization. */
export const DEFAULT_ORG_MODULES: string[] = [
  'subtasks',
  'checklists',
  'attachments',
  'tracking',
  'service_reports',
  'time_tracking',
];

/**
 * Space visibility for this user (defaults to 'all' — admins/managers).
 *
 * ⚠️ An EXTERNAL member is never 'all', whatever the profile says or leaves
 * out: the default 'all' is right for staff and wrong for a client's
 * supervisor, whose whole reach is the workspaces they are assigned to. A
 * profile with no spaceScope (most externals' profiles carry none) handed
 * GET /locations/team the whole company — every member's name and workspace.
 * 'tasks' (no workspaces at all) stays 'tasks'.
 */
export function getSpaceScope(user: { enabledModules?: unknown; isExternal?: boolean | null }): SpaceScope {
  const scope = asProfile(user.enabledModules)?.spaceScope ?? 'all';
  if (user.isExternal === true) return scope === 'tasks' ? 'tasks' : 'own';
  return scope;
}

/** Platforms this user may access (defaults to 'both'). */
export function getAccessPlatforms(user: { enabledModules?: unknown }): AccessPlatform {
  return asProfile(user.enabledModules)?.platforms ?? 'both';
}

/**
 * Whether the user may contact colleagues. Open within the org by default:
 * only an explicit `canContact: false` (set by an admin in the Access Builder)
 * blocks messaging. Undefined / legacy profiles are treated as allowed.
 */
export function canContactColleagues(user: { enabledModules?: unknown }): boolean {
  return asProfile(user.enabledModules)?.canContact !== false;
}

/** Default modules by position */
export const DEFAULT_MODULES: Record<string, MobileModule[]> = {
  technician: ['tasks', 'clock', 'time_off'],
  driver: ['tasks', 'clock'],
  office_manager: ['clock', 'time_off'],
  sales: ['tasks', 'time_off'],
  accountant: ['clock', 'time_off'],
};

/**
 * Get default modules for a position
 */
export function getDefaultModules(position?: string | null): MobileModule[] {
  if (!position) return ['tasks', 'clock', 'time_off'];
  return DEFAULT_MODULES[position] || ['tasks', 'clock', 'time_off'];
}

/**
 * Check if a user has a specific module enabled
 */
export function hasModule(user: { enabledModules?: unknown }, module: MobileModule): boolean {
  return getModules(user).includes(module);
}

/** Permission fields read off a user for access resolution. */
interface UserPermissionFields {
  role?: string | null;
  canCreateTasks?: boolean;
  canAssignTasks?: boolean;
  canViewAllTasks?: boolean;
  canManageUsers?: boolean;
  taskCreationScope?: string | null;
}

/**
 * EMPLOYEE access gate for the closed set of access modules
 * (tasks/clock/time_off/create_task/manage).
 *
 * SINGLE SOURCE OF TRUTH: the two authorization-backed tabs derive from the
 * user's permission fields, never from a stored module flag — so the navigation
 * UI can never contradict the server-side permission guard:
 *   • `create_task` ⟺ `canCreateTasks`
 *   • `manage`      ⟺ `canManageUsers`
 *
 * The remaining tabs (tasks / clock / time_off) are pure feature surfaces read
 * from the per-user Access Profile. Users WITHOUT a profile object (admins,
 * managers, legacy array-form users) implicitly get ALL feature tabs, so a
 * member's selection never clobbers another user's surfaces.
 */
export function hasAccessModule(
  /*
    `access` is typed structurally, not as the branded `ResolvedAccess`.

    Both apps declare their own session shape with plain
    `Record<string, boolean>` maps, which are not assignable to the branded
    PermissionSet. Demanding the exact type here would force a cast at every
    call site — and a cast at a call site is where somebody eventually passes
    the wrong thing.
  */
  user: {
    enabledModules?: unknown;
    access?: { org?: Record<string, boolean>; perSpace?: Record<string, Record<string, boolean>> } | null;
    /** Works for a client or partner (server-resolved on the session). */
    isExternal?: boolean | null;
    /** An administrator who switched their own clock off (review A7). */
    clockOff?: boolean | null;
  } & UserPermissionFields,
  module: MobileModule,
): boolean {
  // Admins have full access by definition — every module, always, regardless of
  // any stored per-user access profile. This keeps "admin = full access" true and
  // immune to a stale/partial enabledModules profile (there are no admin access
  // choices to configure — see AccessBuilder).
  /*
    An administrator may take themselves off the clock (review A7): full access everywhere else, but no
    clock tab, button or widget, and the gateway's @RequireAccessModule('clock') refuses the clock-in.
    Asked before the admin rule, which would otherwise answer yes to every module.
  */
  if (module === 'clock' && user.clockOff === true) return false;
  const role = (user.role || '').toUpperCase();
  if (role === 'ADMIN' || role === 'CLIENT') return true;
  /*
    ⚠️ AN EXTERNAL MEMBER NEVER HOLDS THE CLOCK OR TIME OFF, whatever is stored.
    The rule was enforced only when a profile was SAVED, so an external member
    with no profile at all (null = every module) was offered the Clock tab and
    the server accepted their clock-in. Asked here, it is one answer for the
    tab, the home widget and the server's `@RequireAccessModule`.
  */
  if (user.isExternal === true && EXTERNAL_FORBIDDEN_MODULES.includes(module)) return false;
  /*
    Derived from the permission — org-wide OR held in a space.

    These two read the flat columns, and those carry only the ORG-wide
    resolution. So a member granted "create tasks" by a SPACE role had the
    surface withheld: no Create button on the web tasks page, no create screen
    on mobile — while `POST /tasks`, which is
    `@RequirePermissionInSpace('canCreateTasks')`, would have accepted the
    request. The tab was the last thing still asking the old question.

    Any-space is the right test for a SURFACE. It cannot widen real access: the
    server resolves the permission against the task's own space and refuses
    independently.
  */
  if (module === 'create_task') {
    return (
      user.canCreateTasks === true ||
      accessAllowsAnywhere(user.access as PermissionGrants | null | undefined, 'canCreateTasks')
    );
  }
  if (module === 'manage') {
    return (
      user.canManageUsers === true ||
      accessAllowsAnywhere(user.access as PermissionGrants | null | undefined, 'canManageUsers')
    );
  }
  const profile = asProfile(user.enabledModules);
  if (!profile) return true; // no per-user profile → full access
  return Array.isArray(profile.modules) ? profile.modules.includes(module) : false;
}

/**
 * May this member use this client — the Web / Mobile / Both choice in the
 * Access Profile?
 *
 * This setting was stored, shown in the Access tab, and enforced by nothing: a
 * member set to "Mobile only" could sign in to the web app and use it. It is a
 * policy control rather than a privilege boundary — the member holds the same
 * permissions either way — but an admin who picks one surface means it.
 *
 * Permissive in the same three cases as hasAccessModule, for the same reason:
 * an admin, a user with no profile stored, and the legacy array storage form
 * all pass, so switching enforcement on cannot strand an existing member.
 */
export function canUsePlatform(
  user: { enabledModules?: unknown; role?: string | null },
  client: AccessPlatform,
): boolean {
  const role = (user.role || '').toUpperCase();
  if (role === 'ADMIN' || role === 'CLIENT') return true;
  if (client === 'both') return true;
  const profile = asProfile(user.enabledModules);
  const platforms = profile?.platforms;
  if (!platforms) return true; // nothing configured → no restriction
  return platforms === 'both' || platforms === client;
}

/**
 * The single source of truth for "can this member be assigned a task?" — they
 * must have the `tasks` module, otherwise the task is invisible on their mobile.
 * Used by every assignee picker so the rule lives in one place.
 */
export function canReceiveTasks(user: { enabledModules?: unknown } & UserPermissionFields): boolean {
  return hasAccessModule(user, 'tasks');
}

/** Sort comparator: task-assignable members first, others (clock-only) last. */
export function byAssignableFirst(
  a: { enabledModules?: unknown } & UserPermissionFields,
  b: { enabledModules?: unknown } & UserPermissionFields,
): number {
  return Number(canReceiveTasks(b)) - Number(canReceiveTasks(a));
}

export { UserPermissionFields };
