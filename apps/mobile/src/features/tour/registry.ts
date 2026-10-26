/**
 * Tour catalog — the SINGLE place mobile tours are defined. Adding coverage for
 * a screen is just another entry here (+ a `TourTarget` anchor on the target
 * and i18n keys under `tours.<id>.steps.<key>`) — no engine changes. Gates reuse
 * the same access helpers navigation uses, so users only get tours for screens
 * they actually have.
 *
 * ⚠️ EVERY STEP RINGS THE THING ITS WORDS ARE ABOUT. The v2 screens replaced the
 * ones these tours were written for, and the tours kept pointing at anchors
 * that no longer existed (the welcome opened on "Step 4 of 6") or at a wrapper
 * around a whole header — status-bar padding included — so the ring sat away
 * from the words. Headers anchor their TITLE (`ScreenHeader`'s `tour` prop),
 * buttons anchor themselves, and `radius` gives the ring the shape of what it
 * rings: 999 for a round avatar or a pill, ~22 for a card.
 *
 * `tour-registry.spec.ts` fails if a step names a target no screen registers.
 */
import type { TourDef, TourStep } from './types';

/** Build a step's i18n keys from the tour id + a short key. */
const s = (tourId: string, key: string, target: string, extra?: Partial<TourStep>): TourStep => ({
  target,
  titleKey: `tours.${tourId}.steps.${key}.title`,
  bodyKey: `tours.${tourId}.steps.${key}.body`,
  ...extra,
});

const PILL = 999;
const CARD = 22;
const TEXT = 10;

export const TOURS: TourDef[] = [
  // ── Welcome: the home, then the bar, once for everyone ──
  {
    id: 'welcome',
    titleKey: 'tours.welcome.title',
    icon: 'navigate',
    autoRunOn: '/',
    autoRunExact: true,
    steps: [
      s('welcome', 'greeting', 'home-greeting', { radius: TEXT }),
      s('welcome', 'needs', 'home-needs', { optional: true, radius: CARD }),
      s('welcome', 'widgets', 'home-widgets', { optional: true, radius: CARD }),
      s('welcome', 'tabsTasks', 'tab-tasks', { optional: true, radius: PILL, padding: 4 }),
      s('welcome', 'tabsClock', 'tab-attendance', { optional: true, radius: PILL, padding: 4 }),
      s('welcome', 'tabsTeam', 'tab-team', { optional: true, radius: PILL, padding: 4 }),
      s('welcome', 'tabsChat', 'tab-chat', { optional: true, radius: PILL, padding: 4 }),
      s('welcome', 'tabsMore', 'tab-more', { optional: true, radius: PILL, padding: 4 }),
      s('welcome', 'profile', 'home-avatar', { radius: PILL, padding: 4 }),
    ],
  },

  // ── Jobs list ──
  {
    id: 'tasks',
    titleKey: 'tours.tasks.title',
    icon: 'clients',
    autoRunOn: '/tasks',
    autoRunExact: true,
    gate: (c) => c.hasModule('tasks'),
    steps: [
      s('tasks', 'intro', 'tasks-header', { radius: TEXT }),
      s('tasks', 'newJob', 'tasks-new', { optional: true, radius: PILL, padding: 4 }),
      s('tasks', 'search', 'tasks-search', { optional: true, radius: PILL, padding: 4 }),
      s('tasks', 'scope', 'tasks-scope', { optional: true, radius: PILL, padding: 4 }),
      s('tasks', 'period', 'tasks-period', { optional: true, radius: PILL, padding: 4 }),
      s('tasks', 'filters', 'tasks-filters', { optional: true, radius: PILL, padding: 4 }),
      s('tasks', 'route', 'tasks-route', { optional: true, radius: CARD, padding: 4 }),
      s('tasks', 'next', 'tasks-next', { optional: true, radius: CARD, padding: 4 }),
      s('tasks', 'card', 'tasks-card', { optional: true, radius: 14, padding: 4 }),
    ],
  },

  // ── Job details (a sheet over the list) ──
  {
    id: 'taskDetail',
    titleKey: 'tours.taskDetail.title',
    icon: 'file',
    autoRunOn: '/task/',
    gate: (c) => c.hasModule('tasks'),
    steps: [
      s('taskDetail', 'intro', 'taskdetail-header', { radius: TEXT }),
      s('taskDetail', 'status', 'taskdetail-status', { optional: true, radius: TEXT }),
      s('taskDetail', 'facts', 'taskdetail-facts', { optional: true, radius: CARD, padding: 4 }),
      s('taskDetail', 'map', 'taskdetail-map', { optional: true, radius: CARD, padding: 4 }),
      s('taskDetail', 'checklist', 'taskdetail-checklist', { optional: true, radius: CARD, padding: 4 }),
      s('taskDetail', 'files', 'taskdetail-files', { optional: true, radius: CARD, padding: 4 }),
      s('taskDetail', 'activity', 'taskdetail-activity', { optional: true, radius: CARD, padding: 4 }),
      s('taskDetail', 'timer', 'taskdetail-timer', { optional: true, radius: TEXT }),
      s('taskDetail', 'actions', 'taskdetail-actions', { optional: true, radius: PILL, padding: 4 }),
      s('taskDetail', 'navigate', 'taskdetail-navigate', { optional: true, radius: PILL, padding: 4 }),
      s('taskDetail', 'more', 'taskdetail-more', { optional: true, radius: PILL, padding: 4 }),
    ],
  },

  // ── Time: the clock, the week, time off ──
  {
    id: 'attendance',
    titleKey: 'tours.attendance.title',
    icon: 'time',
    autoRunOn: '/attendance',
    autoRunExact: true,
    gate: (c) => c.hasModule('clock'),
    steps: [
      s('attendance', 'intro', 'attendance-header', { radius: TEXT }),
      s('attendance', 'clock', 'attendance-clock', { radius: CARD, padding: 4 }),
      s('attendance', 'places', 'attendance-places', { optional: true, radius: CARD, padding: 4 }),
      s('attendance', 'status', 'attendance-status', { optional: true, radius: CARD, padding: 4 }),
      s('attendance', 'week', 'attendance-week', { optional: true, radius: CARD, padding: 4 }),
      s('attendance', 'leave', 'attendance-leave', { optional: true, radius: CARD, padding: 4 }),
      s('attendance', 'timeOffButton', 'attendance-timeoff', { optional: true, radius: PILL, padding: 4 }),
      s('attendance', 'history', 'attendance-history', { optional: true, radius: CARD, padding: 4 }),
    ],
  },

  // ── Time off (opened from More) ──
  {
    id: 'timeOff',
    titleKey: 'tours.timeOff.title',
    icon: 'calendar',
    autoRunOn: '/time-off',
    autoRunExact: true,
    gate: (c) => c.hasModule('time_off'),
    steps: [
      s('timeOff', 'intro', 'timeoff-header', { radius: 16 }),
      s('timeOff', 'request', 'timeoff-request', { radius: 16 }),
      s('timeOff', 'list', 'timeoff-list', { optional: true, radius: 16 }),
    ],
  },

  // ── Team ──
  {
    id: 'team',
    titleKey: 'tours.team.title',
    icon: 'people',
    autoRunOn: '/team',
    autoRunExact: true,
    gate: (c) => c.team,
    steps: [
      s('team', 'intro', 'team-header', { radius: TEXT }),
      s('team', 'messages', 'team-messages', { optional: true, radius: PILL, padding: 4 }),
      s('team', 'search', 'team-search', { optional: true, radius: 16, padding: 4 }),
      s('team', 'filters', 'team-filters', { optional: true, radius: PILL, padding: 4 }),
      s('team', 'person', 'team-person', { optional: true, radius: 14, padding: 4 }),
    ],
  },

  // ── More ──
  {
    id: 'more',
    titleKey: 'tours.more.title',
    icon: 'dashboard',
    autoRunOn: '/more',
    autoRunExact: true,
    steps: [
      s('more', 'intro', 'more-header', { radius: TEXT }),
      s('more', 'tiles', 'more-tiles', { optional: true, radius: CARD, padding: 4 }),
      s('more', 'manage', 'more-manage', { optional: true, radius: CARD, padding: 4 }),
    ],
  },

  // ── Profile ──
  {
    id: 'profile',
    titleKey: 'tours.profile.title',
    icon: 'user',
    autoRunOn: '/profile',
    autoRunExact: true,
    steps: [
      s('profile', 'intro', 'profile-header', { radius: CARD, padding: 4 }),
      s('profile', 'availability', 'profile-availability', { optional: true, radius: PILL, padding: 4 }),
      s('profile', 'menu', 'profile-menu', { optional: true, radius: CARD, padding: 4 }),
      s('profile', 'settings', 'profile-settings', { optional: true, radius: CARD, padding: 4 }),
      s('profile', 'guide', 'profile-guide', { radius: 14, padding: 4 }),
    ],
  },
];
