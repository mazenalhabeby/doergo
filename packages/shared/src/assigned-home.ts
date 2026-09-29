/**
 * A phone home screen the office sets up for a member.
 *
 * Stored on the member (`User.assignedHome`), carried on their session, and
 * applied by the phone ONCE — it remembers `setAt`, so the member can then
 * rearrange freely and a later assignment (newer `setAt`) applies again.
 *
 * This file is the only definition of what may be stored: the server validates
 * with `parseAssignedHome` before writing, and the phone reads the same shape.
 * The phone still filters by entitlement when it renders, so an assignment can
 * never show somebody a widget or tile they are not allowed.
 */

/** Every home widget the phone knows. Mirrors `apps/mobile/src/home/registry.tsx`. */
export const HOME_WIDGET_KEYS = ['shift-clock', 'my-work', 'crew', 'clients', 'shortcuts', 'my-route'] as const;
export type HomeWidgetKey = (typeof HOME_WIDGET_KEYS)[number];

/** The Shortcuts card holds four. */
export const ASSIGNED_SHORTCUT_SLOTS = 4;

export interface AssignedHome {
  /** Widgets to show, in order. Every other widget starts switched off. */
  widgets: HomeWidgetKey[];
  /** Shortcut tiles by their row's `labelKey`, in order. Empty = let the card choose. */
  shortcuts: string[];
  /** When it was set — the phone applies each `setAt` once. */
  setAt: string;
}

/*
  A shortcut key is a translation key of a destination row, e.g.
  "shortcuts.documents" or "manage.customers.label". The server cannot import
  the phone's table, so it checks the SHAPE strictly; the phone drops any key
  that is not one of its rows.
*/
const SHORTCUT_KEY = /^(shortcuts|manage)\.[a-zA-Z][a-zA-Z0-9]{0,40}(\.label)?$/;

/**
 * Validate what an admin sent. Throws a plain Error with a readable message;
 * the caller turns it into a 400. Returns the value to store, `setAt` included.
 */
export function parseAssignedHome(input: unknown, now: Date = new Date()): AssignedHome {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A home layout must be an object');
  const { widgets, shortcuts } = input as { widgets?: unknown; shortcuts?: unknown };

  if (!Array.isArray(widgets) || widgets.length === 0) throw new Error('Choose at least one widget');
  if (widgets.length > HOME_WIDGET_KEYS.length) throw new Error('Too many widgets');
  const known = new Set<string>(HOME_WIDGET_KEYS);
  for (const w of widgets) {
    if (typeof w !== 'string' || !known.has(w)) throw new Error(`Unknown widget: ${String(w).slice(0, 40)}`);
  }
  if (new Set(widgets).size !== widgets.length) throw new Error('A widget is listed twice');

  const tiles = shortcuts === undefined || shortcuts === null ? [] : shortcuts;
  if (!Array.isArray(tiles)) throw new Error('shortcuts must be a list');
  if (tiles.length > ASSIGNED_SHORTCUT_SLOTS) throw new Error(`At most ${ASSIGNED_SHORTCUT_SLOTS} shortcuts`);
  for (const s of tiles) {
    if (typeof s !== 'string' || !SHORTCUT_KEY.test(s)) throw new Error(`Unknown shortcut: ${String(s).slice(0, 60)}`);
  }
  if (new Set(tiles).size !== tiles.length) throw new Error('A shortcut is listed twice');

  return { widgets: widgets as HomeWidgetKey[], shortcuts: tiles as string[], setAt: now.toISOString() };
}

/** Read a stored value defensively (the phone and the session both use it). Null when unusable. */
export function readAssignedHome(value: unknown): AssignedHome | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<AssignedHome>;
  if (!Array.isArray(v.widgets) || typeof v.setAt !== 'string') return null;
  const known = new Set<string>(HOME_WIDGET_KEYS);
  return {
    widgets: v.widgets.filter((w): w is HomeWidgetKey => typeof w === 'string' && known.has(w)),
    shortcuts: Array.isArray(v.shortcuts)
      ? v.shortcuts.filter((s): s is string => typeof s === 'string' && SHORTCUT_KEY.test(s)).slice(0, ASSIGNED_SHORTCUT_SLOTS)
      : [],
    setAt: v.setAt,
  };
}
