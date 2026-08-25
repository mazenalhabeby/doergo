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
export interface AccessProfile {
  modules: MobileModule[];     // mobile tabs / home modules
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
  user: { enabledModules?: unknown } & UserPermissionFields,
  module: MobileModule,
): boolean {
  // Admins have full access by definition — every module, always, regardless of
  // any stored per-user access profile. This keeps "admin = full access" true and
  // immune to a stale/partial enabledModules profile (there are no admin access
  // choices to configure — see AccessBuilder).
  const role = (user.role || '').toUpperCase();
  if (role === 'ADMIN' || role === 'CLIENT') return true;
  if (module === 'create_task') return user.canCreateTasks === true;
  if (module === 'manage') return user.canManageUsers === true;
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

// ── Editable Access Draft ────────────────────────────────────────────────────
// The full, editable set of access values an admin configures for a member.
// The SAME shape is used whether EDITING an existing member (Access Builder) or
// PRE-CONFIGURING an invitation — so the member's very first screen already
// matches their final access, with no post-registration "screen change".

/** Feature tabs that live on the Access Profile. `create_task`/`manage` are NOT
 *  stored here — they derive from the permission fields (single source of truth). */
export const FEATURE_TAB_MODULES: MobileModule[] = ['tasks', 'clock', 'time_off'];

/** Everything an admin can set for a member, as editable UI state. */
export interface AccessDraft {
  /** System role tier. ADMIN = org owner (all access). EMPLOYEE = everyone else. */
  systemRole: 'ADMIN' | 'EMPLOYEE';
  /** Org-wide role (AccessRole id) — e.g. Manager. null = no named role. */
  memberRoleId: string | null;
  modules: MobileModule[];
  platforms: AccessPlatform;
  spaceScope: SpaceScope;
  canContact: boolean;
  canCreateTasks: boolean;
  taskCreationScope: string; // NONE | SELF | SPACE | ORG
  canAssignTasks: boolean;
  canViewAllTasks: boolean;
  canManageUsers: boolean;
  contactable: boolean;
  contactScope: string; // NONE | ALL | SELECTED
  contactAllowedIds: string[];
  canViewReports: boolean;
  allowRemote: boolean;
}

/** The persisted shape written to the User (and pre-stored on an Invitation). */
export interface AccessPersisted {
  memberRoleId: string | null;
  enabledModules: {
    modules: MobileModule[];
    platforms: AccessPlatform;
    spaceScope: SpaceScope;
    canContact: boolean;
  };
  canCreateTasks: boolean;
  taskCreationScope: string;
  canAssignTasks: boolean;
  canViewAllTasks: boolean;
  canManageUsers: boolean;
  contactable: boolean;
  contactScope: string;
  contactAllowedIds: string[];
  canViewReports: boolean;
  allowRemote: boolean;
}

/** Least-privilege defaults for a brand-new member (optionally seeded by position). */
export function defaultAccessDraft(opts?: { position?: string | null }): AccessDraft {
  return {
    systemRole: 'EMPLOYEE',
    memberRoleId: null,
    modules: getDefaultModules(opts?.position),
    platforms: 'both',
    spaceScope: 'own',
    canContact: true,
    canCreateTasks: false,
    taskCreationScope: 'NONE',
    canAssignTasks: false,
    canViewAllTasks: false,
    canManageUsers: false,
    contactable: true,
    // Default to "no one": a new member hand-picks nobody. Their real contacts
    // come from the space(s) they're assigned to (space-driven contact) — the
    // space's leader roles. Admins can still widen to ALL/SELECTED per member.
    contactScope: 'NONE',
    contactAllowedIds: [],
    canViewReports: false,
    allowRemote: false,
  };
}

/** Fields an Access Draft is read from on an existing member-like object. */
type AccessMemberLike = { enabledModules?: unknown } & UserPermissionFields & {
  role?: string;
  memberRoleId?: string | null;
  contactable?: boolean;
  contactScope?: string | null;
  contactAllowedIds?: string[] | null;
  canViewReports?: boolean;
  allowRemote?: boolean;
};

/** Read an editable draft from an existing member (any storage form). */
export function readAccessDraft(member: AccessMemberLike): AccessDraft {
  const scope = (member.taskCreationScope as string) || 'SELF';
  return {
    systemRole: member.role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE',
    memberRoleId: member.memberRoleId ?? null,
    modules: getModules(member).filter((m) => FEATURE_TAB_MODULES.includes(m)),
    platforms: getAccessPlatforms(member),
    spaceScope: getSpaceScope(member),
    canContact: canContactColleagues(member),
    canCreateTasks: !!member.canCreateTasks,
    taskCreationScope: scope === 'NONE' ? 'SELF' : scope,
    canAssignTasks: !!member.canAssignTasks,
    canViewAllTasks: !!member.canViewAllTasks,
    canManageUsers: !!member.canManageUsers,
    contactable: !!member.contactable,
    contactScope: member.contactScope || 'NONE',
    contactAllowedIds: member.contactAllowedIds || [],
    canViewReports: !!member.canViewReports,
    allowRemote: !!member.allowRemote,
  };
}

/**
 * Serialize a draft into the persisted shape. Centralizes the coupling rules so
 * every writer (member edit, invite pre-config, backend accept) agrees:
 *   • task scope only when create is on
 *   • allowed-contact list only when scope is SELECTED
 */
export function serializeAccessDraft(d: AccessDraft): AccessPersisted {
  return {
    memberRoleId: d.memberRoleId ?? null,
    enabledModules: {
      modules: d.modules,
      platforms: d.platforms,
      spaceScope: d.spaceScope,
      canContact: d.canContact,
    },
    canCreateTasks: d.canCreateTasks,
    taskCreationScope: d.canCreateTasks ? d.taskCreationScope : 'NONE',
    canAssignTasks: d.canAssignTasks,
    canViewAllTasks: d.canViewAllTasks,
    canManageUsers: d.canManageUsers,
    contactable: d.contactable,
    contactScope: d.contactScope,
    contactAllowedIds: d.contactScope === 'SELECTED' ? d.contactAllowedIds : [],
    canViewReports: d.canViewReports,
    allowRemote: d.allowRemote,
  };
}

const _PLATFORMS: AccessPlatform[] = ['web', 'mobile', 'both'];
const _SPACE_SCOPES: SpaceScope[] = ['own', 'tasks', 'all'];
const _TASK_SCOPES = ['NONE', 'SELF', 'SPACE', 'ORG'];
const _CONTACT_SCOPES = ['NONE', 'ALL', 'SELECTED'];
const _bool = (v: unknown, dflt = false): boolean => (typeof v === 'boolean' ? v : dflt);

/**
 * Sanitize an UNTRUSTED access-profile object (e.g. one stored on an invitation)
 * into the exact persisted shape. Whitelists every field — never spreads raw
 * client JSON onto a User. Returns null when there is nothing usable.
 */
export function normalizeAccessProfile(raw: unknown): AccessPersisted | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const emRaw = r.enabledModules;
  const em: Record<string, unknown> =
    emRaw && typeof emRaw === 'object' && !Array.isArray(emRaw)
      ? (emRaw as Record<string, unknown>)
      : {};
  const modules = Array.isArray(em.modules)
    ? (em.modules as unknown[]).filter((m): m is MobileModule =>
        FEATURE_TAB_MODULES.includes(m as MobileModule),
      )
    : [];
  const platforms = _PLATFORMS.includes(em.platforms as AccessPlatform)
    ? (em.platforms as AccessPlatform)
    : 'both';
  const spaceScope = _SPACE_SCOPES.includes(em.spaceScope as SpaceScope)
    ? (em.spaceScope as SpaceScope)
    : 'own';
  const canCreateTasks = _bool(r.canCreateTasks);
  const taskScope = _TASK_SCOPES.includes(r.taskCreationScope as string)
    ? (r.taskCreationScope as string)
    : 'NONE';
  const contactScope = _CONTACT_SCOPES.includes(r.contactScope as string)
    ? (r.contactScope as string)
    : 'ALL';
  return {
    // Untrusted invite JSON never carries a validated role assignment.
    memberRoleId: null,
    enabledModules: { modules, platforms, spaceScope, canContact: _bool(em.canContact, true) },
    canCreateTasks,
    taskCreationScope: canCreateTasks ? taskScope : 'NONE',
    canAssignTasks: _bool(r.canAssignTasks),
    canViewAllTasks: _bool(r.canViewAllTasks),
    canManageUsers: _bool(r.canManageUsers),
    contactable: _bool(r.contactable, true),
    contactScope,
    contactAllowedIds:
      contactScope === 'SELECTED' && Array.isArray(r.contactAllowedIds)
        ? (r.contactAllowedIds as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
    canViewReports: _bool(r.canViewReports),
    allowRemote: _bool(r.allowRemote),
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
