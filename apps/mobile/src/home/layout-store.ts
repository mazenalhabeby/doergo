import AsyncStorage from '@react-native-async-storage/async-storage';

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
