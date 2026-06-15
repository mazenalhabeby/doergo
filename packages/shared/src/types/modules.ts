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

/** Space visibility for this user (defaults to 'all' — admins/managers). */
export function getSpaceScope(user: { enabledModules?: unknown }): SpaceScope {
  return asProfile(user.enabledModules)?.spaceScope ?? 'all';
}

/** Platforms this user may access (defaults to 'both'). */
export function getAccessPlatforms(user: { enabledModules?: unknown }): AccessPlatform {
  return asProfile(user.enabledModules)?.platforms ?? 'both';
}

/** Whether the user may contact colleagues (defaults to false). */
export function canContactColleagues(user: { enabledModules?: unknown }): boolean {
  return asProfile(user.enabledModules)?.canContact === true;
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
