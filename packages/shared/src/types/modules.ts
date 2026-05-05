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
  const modules = user.enabledModules;
  if (!modules || !Array.isArray(modules)) return false;
  return modules.includes(module);
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
