import AsyncStorage from '@react-native-async-storage/async-storage';
import { HOME_WIDGET_KEYS, type AssignedHome } from '@hbcfield/shared/client';

/**
 * The member's arrangement of their own home screen.
 *
 * ⚠️ THE DESIGN ASKS FOR THIS SERVER-SIDE AND IT IS NOT, YET.
 *
 * `home-widgets.md` §2.2 is explicit: *"Stored server-side as
 * `HomeLayout { userId, keys[], hidden[] }` and pulled like any other record,
 * so it survives a reinstall and works offline. Not AsyncStorage."* It is
 * right — an arrangement somebody spent a minute on should not be lost by
 * changing phones, and it is the sort of thing people re-do once and then stop
 * bothering with.
 *
 * It is local for now because the server change was declined, and local is
 * honest about what it is: this file is the ONLY thing that knows where the
 * layout lives. Moving it is replacing two functions, and nothing above here
 * changes.
 *
 * ⚠️ KEYED BY USER. Sign out and in as a colleague on the same device and the
 * provider is not remounted — an unkeyed layout would hand the next person the
 * previous one's home screen.
 */

export interface HomeLayout {
  /** The order. Every key the member has ever had, arranged. */
  keys: string[];
  /**
   * Switched off.
   *
   * ⚠️ HIDDEN IS NOT REMOVED — the key stays in `keys`, so a widget switched
   * back on returns to the position it was arranged into rather than to the
   * bottom. It is also what lets an unavailable widget be skipped silently and
   * never deleted: a workspace reassignment that is later undone does not
   * destroy the arrangement.
   */
  hidden: string[];
}

export const EMPTY_LAYOUT: HomeLayout = { keys: [], hidden: [] };

const keyFor = (userId: string) => `@hbcfield/home-layout/${userId}`;

export async function loadLayout(userId: string): Promise<HomeLayout> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return EMPTY_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<HomeLayout>;
    /*
      Defensive on read, because this is the one input the app cannot control:
      a half-written value, an older shape, a key that no longer exists in the
      registry. None of those should cost somebody their home screen — an
      unreadable layout is simply no layout, which composes the default.
    */
    return {
      keys: Array.isArray(parsed.keys) ? parsed.keys.filter((k) => typeof k === 'string') : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((k) => typeof k === 'string') : [],
    };
  } catch {
    return EMPTY_LAYOUT;
  }
}

export async function saveLayout(userId: string, layout: HomeLayout): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(layout));
  } catch {
    /*
      Silent. A failed write means the arrangement does not survive the app
      being killed — which is a disappointment, not an error the member can do
      anything about, and a toast about storage on a home screen is noise about
      something nobody asked for.
    */
  }
}

/*
  ── The Shortcuts card's four ──
  An arrangement, like the order above — so it lives here, the one place a
  home arrangement is kept (remembered-widgets.spec.ts). Up to four keys.
*/

const shortcutsKey = (userId: string) => `@hbcfield/home-shortcuts/${userId}`;

/** null = never chosen: the card keeps choosing for them. */
export async function loadShortcuts(userId: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(shortcutsKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string').slice(0, 4) : null;
  } catch {
    return null;
  }
}

export async function saveShortcuts(userId: string, keys: string[] | null): Promise<void> {
  try {
    if (keys) await AsyncStorage.setItem(shortcutsKey(userId), JSON.stringify(keys.slice(0, 4)));
    else await AsyncStorage.removeItem(shortcutsKey(userId));
  } catch {
    /* A lost choice falls back to the smart picks — a disappointment, not an error. */
  }
  shortcutListeners.forEach((fn) => fn(userId));
}

/*
  A card already on screen hears about a change it did not make — the office's
  layout being applied while the home is open. Its own saves notify too, which
  only re-reads what it just wrote.
*/
const shortcutListeners = new Set<(userId: string) => void>();
export function onShortcutsChanged(fn: (userId: string) => void): () => void {
  shortcutListeners.add(fn);
  return () => { shortcutListeners.delete(fn); };
}

/*
  ── A home screen the office set up ──
  Applied ONCE per assignment: the phone remembers which `setAt` it applied, so
  the member can rearrange freely afterwards and nothing puts it back — until
  the office sets a new one, which carries a newer `setAt`.
*/

const appliedKey = (userId: string) => `@hbcfield/home-assigned/${userId}`;

export async function appliedAssignment(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(appliedKey(userId));
  } catch {
    return null;
  }
}

export async function markAssignmentApplied(userId: string, setAt: string): Promise<void> {
  try {
    await AsyncStorage.setItem(appliedKey(userId), setAt);
  } catch {
    /* Worst case it is applied again next launch — the same layout, harmless. */
  }
}

/**
 * The assignment as a layout: its widgets in its order, then every other widget
 * switched OFF — so the defaults do not reappear beside it, and each one is
 * still in the gallery for the member to add back.
 */
export function layoutFromAssignment(assigned: Pick<AssignedHome, 'widgets'>): HomeLayout {
  const chosen = assigned.widgets.filter((k, i, all) => all.indexOf(k) === i);
  const rest = HOME_WIDGET_KEYS.filter((k) => !chosen.includes(k));
  return { keys: [...chosen, ...rest], hidden: [...rest] };
}
