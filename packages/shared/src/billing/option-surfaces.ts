import { ADD_ON_KEYS, orgHasAddOn } from './add-ons';

/**
 * Where each Option shows itself — one table, read by every surface.
 *
 * An Option that is switched off has to disappear in three places: the server
 * refuses the write, the page refuses to render, and — the one that was missing
 * everywhere — THE WAY IN GOES. A control somebody can press that then refuses
 * is worse than no control: it reads as broken software rather than as something
 * unbought, and it is read that way by every member of the organization, not
 * just the admin who could do something about it.
 *
 * ⚠️ Why a table and not a condition at each site. The navigation decided every
 * item on PERMISSIONS ALONE — not one of them consulted what the organization
 * had bought — so switching an option off left its entry point exactly where it
 * was, for every role. Fixing that by adding twelve conditions across six files
 * is how the thirteenth gets forgotten. Here, adding an Option means adding a
 * row, and a test walks this table against the navigation source.
 *
 * It maps SURFACES, not routes: the server side is `@RequirePlan` on the
 * controller, which is enforcement and belongs with the routes it protects. This
 * is only about what a person can see.
 */

/** A navigation href, keyed to the Option that owns it. */
export const NAV_OPTION: Readonly<Record<string, string>> = {
  '/invoices': 'invoicing',
  '/overtime': 'overtime',
  '/schedule': 'shift_scheduling',
} as const;

/**
 * A workspace tab, keyed to the Option that owns it.
 *
 * `attendance` is deliberately absent: clocking in is a MODULE, and only the
 * rota inside it is the Option. Taking the whole tab away would remove a
 * workspace's timekeeping because nobody bought shift planning.
 */
export const SPACE_TAB_OPTION: Readonly<Record<string, string>> = {
  workflow: 'workflows',
  /*
    ⚠️ `invoices` is gone from here because the TAB is gone. Invoices moved out
    of a workspace's settings to /invoices, alongside clients, assets and
    portals — they are what a workspace HAS, not how it is configured. The
    Option still owns the surface; it is owned through NAV_OPTION now, which is
    where a page rather than a tab is claimed.
  */
} as const;

/** A settings section, keyed to the Option that owns it. */
export const SETTINGS_OPTION: Readonly<Record<string, string>> = {
  'audit-log': 'audit_log',
} as const;

/**
 * Does this organization get to see this surface?
 *
 * `true` for anything the table does not claim — most of the product is not an
 * Option, and a helper that hid whatever it did not recognise would empty the
 * navigation the first time somebody renamed a route.
 *
 * ⚠️ The opposite default would be safer for revenue and disastrous for use, so
 * the fail-closed guarantee lives where it belongs: on the SERVER, in PlanGuard,
 * which refuses an unknown key. This only decides what is drawn.
 */
export function surfaceAllowed(
  table: Readonly<Record<string, string>>,
  surface: string,
  addOns: string[] | null | undefined,
): boolean {
  const option = table[surface];
  if (!option) return true;
  return orgHasAddOn(addOns, option);
}

/** Every Option that owns at least one surface — what the test walks. */
export function optionsWithSurfaces(): string[] {
  const keys = new Set<string>([
    ...Object.values(NAV_OPTION),
    ...Object.values(SPACE_TAB_OPTION),
    ...Object.values(SETTINGS_OPTION),
  ]);
  return [...keys].filter((k) => (ADD_ON_KEYS as readonly string[]).includes(k));
}
