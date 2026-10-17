/** The editable access draft — one shape for editing a member and for an invitation. */
import type { MobileModule } from './mobile';
import {
  canContactColleagues,
  getAccessPlatforms,
  getDefaultModules,
  getModules,
  getSpaceScope,
  type AccessPlatform,
  type SpaceScope,
  type UserPermissionFields,
} from './profile';

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
