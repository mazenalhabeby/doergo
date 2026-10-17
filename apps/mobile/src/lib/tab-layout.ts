import { Role, canContactColleagues, hasAccessModule, normalizeRole } from '@hbcfield/shared/client';
import { isExternalMember } from './member-reach';
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
 * because it is an action rather than a place. Time off and Team are visited
 * occasionally and go behind More first.
 *
 * ⚠️ Manage is absent by design. It was a tab whose whole content was a list of
 * links, sitting next to More, which is also a list of links. Its rows live in
 * More now — one door instead of two, and one fewer permanent slot spent on a
 * menu.
 */
/*
  v2 — THE SET IS FIXED: Home · Jobs · Clock · Team, then More.

  ⚠️ Three routes LEFT the bar and none of them lost its door.

    create-task  is a tile in the shortcuts rail now. It could not be one
                 before — "never a tile for a tab" — and it can be one the
                 moment it stops being a tab.
    time-off     falls into the overflow, which is what the overflow is for.
    team         is the fourth slot, and holds chat (People | Messages).

  ⚠️ `chat` is NOT a tab any more (2026-10-15): its list is Team → Messages,
  and `(tabs)/chat.tsx` stays only as the ROUTE of one conversation (href: null,
  never in the bar or More). It stays inside `(tabs)` because `(tabs)` is a
  group: `app/(app)/chat.tsx` would also resolve to `/chat`, and two files on
  one route once rendered a blank screen for every chat push.

  The order is FIXED, not adaptive. A bar that reorders itself by usage moves
  the target out from under the thumb of the person who uses it most — muscle
  memory is the entire value of a tab bar and it is the one thing an adaptive
  bar destroys.
*/
/*
  ⚠️ TEAM HOLDS CHAT (2026-10-15, the owner's choice): one tab, People |
  Messages, with the unread count on the tab.
*/
/*
  The calendar sits in the overflow (More) behind the fixed four — the owner fixed the bar — and
  its own day reaches the home screen through the Today card.
*/
export const TAB_PRIORITY = ['index', 'tasks', 'attendance', 'team', 'calendar', 'time-off', 'create-task'];

const byPriority = (a: { name: string }, b: { name: string }) => {
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
export function splitTabs<T extends { name: string }>(
  visible: T[],
  /**
   * Does More have something in it besides overflow — the Manage rows?
   *
   * ⚠️ Load-bearing. Without it, a supervisor with five or fewer tabs gets no
   * More entry at all, and the management screens behind it become unreachable:
   * four of them have no other door anywhere in the app.
   */
  hasExtras = false,
): { barRoutes: T[]; overflowRoutes: T[]; showMore: boolean } {
  const showMore = hasExtras || visible.length > MAX_TABS;
  if (!showMore) return { barRoutes: visible, overflowRoutes: [], showMore: false };

  const ranked = [...visible].sort(byPriority);
  // More costs one of the five, whether it holds overflow, Manage rows or both.
  return {
    barRoutes: ranked.slice(0, MAX_TABS - 1),
    overflowRoutes: ranked.slice(MAX_TABS - 1),
    showMore: true,
  };
}

/* ------------------------------------------------------------------ */
/* Who sees which tab — ONE answer for the bar and the More page        */
/* ------------------------------------------------------------------ */


interface TabAccess {
  isAdmin: boolean;
  tasks: boolean;
  attendance: boolean;
  timeOff: boolean;
  create: boolean;
  team: boolean;
  chat: boolean;
  /** An external member holds no calendar of ours: no clock, no leave, no days. */
  calendar: boolean;
}

/**
 * What a member may have as a tab, from the member alone.
 *
 * ⚠️ ONE COPY. The tab bar decided this inline and the navigator's `href`s
 * decided it again beside it; the More page is a third reader. Three copies of
 * "who gets Time off" is how the bar hides a tab the More page still offers.
 *
 * `create` IS the create permission (`create_task` derives from
 * `canCreateTasks`, org-wide or in a space). Chat needs BOTH the bought add-on
 * and permission to talk to colleagues — either missing and there is no slot.
 */
export function tabAccessFor(user: Record<string, unknown> | null | undefined): TabAccess {
  const u = (user ?? {}) as never;
  return {
    isAdmin: normalizeRole(((user as { role?: string } | null)?.role) || '') === Role.ADMIN,
    tasks: hasAccessModule(u, 'tasks'),
    attendance: hasAccessModule(u, 'clock'),
    timeOff: hasAccessModule(u, 'time_off'),
    create: hasAccessModule(u, 'create_task'),
    team: canContactColleagues(u),
    // Team chat is part of the product, not the paid "Live Chat Support" option
    // (that is the support desk) — it was gated on it by mistake until 2026-10-15.
    chat: canContactColleagues(u),
    // An external member holds no calendar (`@DenyExternal` on /calendar).
    calendar: !!user && !isExternalMember(user as never),
  };
}

/**
 * Is this route a tab for this member?
 *
 * `profile` is the avatar, `manage` and `more` are pages reached from More —
 * none of them is ever a slot. An admin gets everything they are not refused,
 * except Time off (they approve leave; they do not have a Time off tab).
 */
export function tabVisible(name: string, a: TabAccess): boolean {
  if (name === 'profile' || name === 'manage' || name === 'more') return false;
  // A route, never a slot: its list is Team → Messages (2026-10-15). `a.chat` still says who may chat.
  if (name === 'chat') return false;
  if (name === 'calendar') return a.calendar;
  if (name === 'team') return a.team;
  if (name === 'attendance') return a.attendance;
  if (a.isAdmin) return name !== 'time-off';
  if (name === 'create-task') return a.create;
  if (name === 'tasks') return a.tasks;
  if (name === 'time-off') return a.timeOff;
  return true;
}

/** A tab's name as the bar and the More page both say it. */
export const TAB_TITLE_KEY: Record<string, string> = {
  index: 'tabs.home',
  tasks: 'tabs.tasks',
  'create-task': 'tabs.createTask',
  attendance: 'tabs.attendance',
  'time-off': 'tabs.timeOff',
  team: 'tabs.team',
  chat: 'tabs.messages',
  calendar: 'tabs.calendar',
};
