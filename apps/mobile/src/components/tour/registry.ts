/**
 * Tour catalog — the SINGLE place mobile tours are defined. Adding coverage for
 * a screen is just another entry here (+ a `useTourTarget` anchor on the target
 * and i18n keys under `tours.<id>.steps.<key>`) — no engine changes. Gates reuse
 * the same access helpers navigation uses, so users only get tours for screens
 * they actually have. Mobile is technician-focused.
 */
import type { TourDef, TourStep } from './types';

/** Build a step's i18n keys from the tour id + a short key. */
const s = (tourId: string, key: string, target: string, extra?: Partial<TourStep>): TourStep => ({
  target,
  titleKey: `tours.${tourId}.steps.${key}.title`,
  bodyKey: `tours.${tourId}.steps.${key}.body`,
  ...extra,
});

export const TOURS: TourDef[] = [
  // ── Welcome: runs once on the Home tab for everyone ──
  {
    id: 'welcome',
    titleKey: 'tours.welcome.title',
    icon: 'compass-outline',
    autoRunOn: '/',
    autoRunExact: true,
    steps: [
      s('welcome', 'greeting', 'home-greeting'),
      s('welcome', 'today', 'home-today', { optional: true }),
      s('welcome', 'work', 'home-work', { optional: true }),
      s('welcome', 'tabsTasks', 'tab-tasks', { optional: true }),
      s('welcome', 'tabsClock', 'tab-attendance', { optional: true }),
      /*
        ⚠️ `tabsTimeOff` was here and is GONE.

        Time off left the bar for the overflow in v2, so `tab-time-off` never
        mounts and the step could only ever be skipped. It was `optional`, so
        nothing would have broken — it would simply have been a step that
        silently did not happen, on every run, for everybody. A tour that
        quietly drops a sixth of itself is worse than one that is honestly
        shorter. The copy under `tour.welcome.tabsTimeOff` is left in the
        locale files: it is the right sentence if Time off ever earns a slot
        back, and deleting five translations to save five lines is not a trade.
      */
      s('welcome', 'profile', 'tab-profile'),
    ],
  },

  // ── Tasks (jobs) list ──
  {
    id: 'tasks',
    titleKey: 'tours.tasks.title',
    icon: 'briefcase-outline',
    autoRunOn: '/tasks',
    autoRunExact: true,
    gate: (c) => c.hasModule('tasks'),
    steps: [
      s('tasks', 'intro', 'tasks-header'),
      s('tasks', 'search', 'tasks-search', { optional: true }),
      s('tasks', 'filters', 'tasks-filters', { optional: true }),
      s('tasks', 'card', 'tasks-card', { optional: true }),
    ],
  },

  // ── Task detail ──
  {
    id: 'taskDetail',
    titleKey: 'tours.taskDetail.title',
    icon: 'document-text-outline',
    autoRunOn: '/task/',
    gate: (c) => c.hasModule('tasks'),
    steps: [
      s('taskDetail', 'intro', 'taskdetail-header'),
      s('taskDetail', 'status', 'taskdetail-status', { optional: true }),
      s('taskDetail', 'actions', 'taskdetail-actions', { optional: true }),
    ],
  },

  // ── Clock / attendance ──
  {
    id: 'attendance',
    titleKey: 'tours.attendance.title',
    icon: 'time-outline',
    autoRunOn: '/attendance',
    autoRunExact: true,
    gate: (c) => c.hasModule('clock'),
    steps: [
      s('attendance', 'intro', 'attendance-header'),
      s('attendance', 'clock', 'attendance-clock'),
      s('attendance', 'status', 'attendance-status', { optional: true }),
      s('attendance', 'history', 'attendance-history', { optional: true }),
    ],
  },

  // ── Time off ──
  {
    id: 'timeOff',
    titleKey: 'tours.timeOff.title',
    icon: 'calendar-outline',
    autoRunOn: '/time-off',
    autoRunExact: true,
    gate: (c) => c.hasModule('time_off'),
    steps: [
      s('timeOff', 'intro', 'timeoff-header'),
      s('timeOff', 'request', 'timeoff-request'),
      s('timeOff', 'list', 'timeoff-list', { optional: true }),
    ],
  },

  // ── Profile ──
  {
    id: 'profile',
    titleKey: 'tours.profile.title',
    icon: 'person-outline',
    autoRunOn: '/profile',
    autoRunExact: true,
    steps: [
      s('profile', 'intro', 'profile-header'),
      s('profile', 'availability', 'profile-availability', { optional: true }),
      s('profile', 'menu', 'profile-menu'),
      s('profile', 'guide', 'profile-guide'),
    ],
  },
];
