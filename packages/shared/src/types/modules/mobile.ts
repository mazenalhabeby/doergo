/** The phone's tabs, and which of them an external member never holds. */

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

/**
 * Modules an EXTERNAL member cannot hold, whatever an admin ticks.
 *
 * `clock` and `time_off` are not features, they are an employment: clocking in
 * records hours WE owe payment for, and a vacation request asks US for leave.
 * A client's or partner's supervisor does neither, and offering it produces a
 * screen where somebody books holiday from a company they do not work for.
 *
 * Enforced when the profile is SAVED rather than hidden in the editor. The
 * access panel is deliberately identical for everybody, so the rule cannot live
 * in a checkbox — it has to survive whatever the panel offers.
 */
export const EXTERNAL_FORBIDDEN_MODULES: MobileModule[] = ['clock', 'time_off'];

/**
 * May an external member hold this module?
 *
 * Exported so the ACCESS PANEL can ask the same question the save enforces.
 * It could not, and so it offered Clock and Time off to an external member,
 * accepted the click, and let the server drop them on save — the toggle simply
 * bounced back with nothing said. A rule the UI cannot see is a rule the UI
 * will contradict.
 */
export function moduleAllowedForExternal(m: MobileModule): boolean {
  return !EXTERNAL_FORBIDDEN_MODULES.includes(m);
}

/** An external member's module list, with the ones that cannot apply removed. */
export function filterExternalModules(modules: unknown): MobileModule[] {
  if (!Array.isArray(modules)) return [];
  return (modules as MobileModule[]).filter(moduleAllowedForExternal);
}
