/**
 * Mobile Module Configuration
 *
 * Defines which features/tabs are available to each user.
 * Replaces the old WorkMode-based tab gating.
 */

/** Available mobile modules (tab identifiers) */
export type MobileModule = 'tasks' | 'clock' | 'time_off' | 'create_task' | 'manage';

/** All available modules */
export const ALL_MODULES: MobileModule[] = ['tasks', 'clock', 'time_off', 'create_task', 'manage'];

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
/** Web screens a user may open. */
export type WebScreen = 'dashboard' | 'tasks' | 'team' | 'schedule' | 'attendance';

export interface AccessProfile {
  modules: MobileModule[];     // mobile tabs / home modules
  webScreens?: WebScreen[];    // allowed web screens
  spaceScope?: SpaceScope;     // space visibility
  platforms?: AccessPlatform;  // web / mobile / both
  canContact?: boolean;        // can message & call colleagues
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

/** Space visibility for this user (defaults to 'all' — admins/managers). */
export function getSpaceScope(user: { enabledModules?: unknown }): SpaceScope {
  return asProfile(user.enabledModules)?.spaceScope ?? 'all';
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

/** Allowed web screens (defaults: Dashboard + Tasks when not specified). */
export function getWebScreens(user: { enabledModules?: unknown }): WebScreen[] {
  const profile = asProfile(user.enabledModules);
  return profile?.webScreens ?? ['dashboard', 'tasks'];
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
export interface UserPermissionFields {
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
  user: { enabledModules?: unknown } & UserPermissionFields,
  module: MobileModule,
): boolean {
  if (module === 'create_task') return user.canCreateTasks === true;
  if (module === 'manage') return user.canManageUsers === true;
  const profile = asProfile(user.enabledModules);
  if (!profile) return true; // no per-user profile → full access
  return Array.isArray(profile.modules) ? profile.modules.includes(module) : false;
}

/**
 * The single source of truth for "can this member be assigned a task?" — they
 * must have the `tasks` module, otherwise the task is invisible on their mobile.
 * Used by every assignee picker so the rule lives in one place.
 */
export function canReceiveTasks(
  user: { enabledModules?: unknown } & UserPermissionFields,
): boolean {
  return hasAccessModule(user, 'tasks');
}

/** Sort comparator: task-assignable members first, others (clock-only) last. */
export function byAssignableFirst(
  a: { enabledModules?: unknown } & UserPermissionFields,
  b: { enabledModules?: unknown } & UserPermissionFields,
): number {
  return Number(canReceiveTasks(b)) - Number(canReceiveTasks(a));
}

// ── Unified access resolver ──────────────────────────────────────────────────
// ONE object describing everything a user can do/see — merges the per-user
// Access Profile (reach + feature tabs) with the enforced permission fields
// (authorization). Every consumer (web nav, mobile nav, presets) reads this so
// there is a single, coherent notion of "access" across the app.

export interface ResolvedAccess {
  platforms: AccessPlatform;
  spaceScope: SpaceScope;
  canContact: boolean;
  /** Feature tabs the user sees (tasks/clock/time_off + derived create_task/manage). */
  modules: MobileModule[];
  canCreateTasks: boolean;
  canAssignTasks: boolean;
  canViewAllTasks: boolean;
  canManageUsers: boolean;
  taskCreationScope: string;
}

export function resolveUserAccess(
  user: { enabledModules?: unknown } & UserPermissionFields,
): ResolvedAccess {
  const featureTabs: MobileModule[] = (['tasks', 'clock', 'time_off'] as MobileModule[]).filter(
    (m) => hasAccessModule(user, m),
  );
  const canCreateTasks = user.canCreateTasks === true;
  const canManageUsers = user.canManageUsers === true;
  const modules = [...featureTabs];
  if (canCreateTasks) modules.push('create_task');
  if (canManageUsers) modules.push('manage');

  return {
    platforms: getAccessPlatforms(user),
    spaceScope: getSpaceScope(user),
    canContact: canContactColleagues(user),
    modules,
    canCreateTasks,
    canManageUsers,
    canAssignTasks: user.canAssignTasks === true,
    canViewAllTasks: user.canViewAllTasks === true,
    taskCreationScope: (user.taskCreationScope as string) || 'NONE',
  };
}

/**
 * Get display label for a module
 */
export function getModuleLabel(module: MobileModule): string {
  switch (module) {
    case 'tasks':
      return 'Tasks';
    case 'clock':
      return 'Clock In/Out';
    case 'time_off':
      return 'Time Off';
    case 'create_task':
      return 'Create Task';
    case 'manage':
      return 'Manage';
    default:
      return module;
  }
}
