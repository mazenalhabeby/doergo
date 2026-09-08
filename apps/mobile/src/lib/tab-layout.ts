/*
  Five is the whole bar.

  Tabs are granted by the Access Profile, so the count is not a design choice —
  an admin who also works a site can legitimately qualify for seven. Seven in a
  phone-width row gives each one about 53px: the labels shrink until they are
  unreadable (`adjustsFontSizeToFit` hides the overflow rather than fixing it)
  and the touch targets fall below the 44px every platform asks for. The bar
  stops being navigation and becomes a puzzle.

  So: up to five are shown. Beyond that, four stay and the fifth becomes More.

  ⚠️ The order is FIXED, not adaptive. A bar that reorders itself by usage
  moves the target out from under the thumb of the person who uses it most —
  muscle memory is the entire value of a tab bar, and it is the one thing an
  adaptive bar destroys.
*/
export const MAX_TABS = 5;

/**
 * Which tabs earn a permanent slot, most-used first.
 *
 * Home is where the day starts. Tasks and Clock are the two things a field
 * member opens all day, and between them they cover both kinds of member —
 * whoever holds only one of the two never overflows at all. Create is next
 * because it is an action rather than a place. Manage, Time off and Team are
 * visited occasionally and go behind More first.
 */
export const TAB_PRIORITY = ['index', 'tasks', 'attendance', 'create-task', 'manage', 'time-off', 'team'];

export const byPriority = (a: { name: string }, b: { name: string }) => {
  const ia = TAB_PRIORITY.indexOf(a.name);
  const ib = TAB_PRIORITY.indexOf(b.name);
  // An unknown route keeps its position rather than jumping to the front.
  return (ia < 0 ? TAB_PRIORITY.length : ia) - (ib < 0 ? TAB_PRIORITY.length : ib);
};

/**
 * What fits in the bar, and what goes behind More.
 *
 * Five or fewer: all of them, and no More at all — most members never see it.
 * More than five: four keep their slot and the rest move, because the More
 * entry costs one of the five.
 */
export function splitTabs<T extends { name: string }>(visible: T[]): { barRoutes: T[]; overflowRoutes: T[] } {
  if (visible.length <= MAX_TABS) return { barRoutes: visible, overflowRoutes: [] };
  const ranked = [...visible].sort(byPriority);
  return { barRoutes: ranked.slice(0, MAX_TABS - 1), overflowRoutes: ranked.slice(MAX_TABS - 1) };
}

/**
 * A tab's icon, filled when it is the one you are on.
 *
 * Extracted because the overflow sheet draws the same tabs: two copies of this
 * map is one of them quietly disagreeing the next time a tab is added.
 */
export function tabIconName(routeName: string, focused: boolean): string {
  switch (routeName) {
    case 'index': return focused ? 'home' : 'home-outline';
    case 'tasks': return focused ? 'clipboard' : 'clipboard-outline';
    case 'create-task': return focused ? 'add-circle' : 'add-circle-outline';
    case 'manage': return focused ? 'grid' : 'grid-outline';
    case 'attendance': return focused ? 'time' : 'time-outline';
    case 'time-off': return focused ? 'calendar' : 'calendar-outline';
    case 'team': return focused ? 'people' : 'people-outline';
    default: return focused ? 'person' : 'person-outline';
  }
}

