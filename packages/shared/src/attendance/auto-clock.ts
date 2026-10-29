/**
 * AUTOMATIC CLOCK-IN AND CLOCK-OUT — decided on the phone, offline, with the
 * same rules the server repeats.
 *
 * For workplaces where people forget to clock (a factory hall with no signal).
 * The phone's OS geofence wakes the app on entering and leaving a workspace,
 * even when it is closed; the phone decides with these pure functions plus the
 * existing local clock-in check (`checkClockInLocally`), files the step in its
 * offline outbox with the REAL moment it happened, and the server re-checks it
 * on arrival. Nothing here needs a connection.
 *
 * ⚠️ OPT-IN TWICE: the workspace switches it on and picks the members, AND each
 * member consents in the app (location-based control — ArbVG §96 needs a works
 * council agreement or the person's consent). No consent, no arming.
 *
 * ⚠️ THE MOMENT RECORDED IS WHEN IT HAPPENED: arrival = when they entered the
 * area; departure = when they left it. Never the moment a timer ran out —
 * counted time already starts at the shift start, so an early arrival adds
 * nothing.
 *
 * ⚠️ AN AUTOMATIC STEP IS MARKED, NOT SUSPECTED: AUTO_CLOCK_IN / AUTO_CLOCK_OUT
 * are informational (approved on arrival when nothing else needs a person).
 * Everything that sends a manual clock-in to review still does.
 */

export {
  type AutoClockSettings,
  AUTO_CLOCK_DEFAULTS,
  AUTO_CLOCK_LIMITS,
  type AutoClockSettingsError,
  parseAutoClockSettings,
  readAutoClockSettings,
} from './auto-clock/settings';
export {
  type AutoClockInDecision,
  decideAutoClockIn,
  type AutoClockOutDecision,
  decideAutoClockOut,
  AUTO_REST_AFTER_MINUTES,
  autoRestPlan,
} from './auto-clock/decisions';
export {
  AUTO_CLOCK_MODES,
  type AutoClockMode,
  isAutoClockMode,
  type AutoClockStartWindow,
  parseAutoClockStartWindow,
  readAutoClockStartWindow,
  type MemberAutoClockSettings,
  startWindowAround,
  type PresenceClockInDecision,
  decidePresenceClockIn,
  presenceSessionEnd,
  presenceCloseDue,
  seenOnSiteRecently,
  clocksByPresence,
  START_WINDOW_MIN_SAMPLES,
  suggestStartWindow,
} from './auto-clock/presence';
export {
  AUTO_CLOCK_IN_FLAG,
  AUTO_CLOCK_OUT_FLAG,
  AUTO_REST_FLAG,
  AUTO_CLOCK_UNDO_MINUTES,
  CLOCK_TRIGGERS,
  type ClockTrigger,
  type AutoClockPlace,
  type AutoClockPlan,
  showAutoClockSwitch,
  autoClockActive,
  autoClockOffered,
  type AutoClockMemberInput,
  autoClockInWithinWindow,
  autoClockOutAfterEnd,
  presenceClockInAllowed,
  AUTO_CLOCK_UNDO_SLACK_MINUTES,
  autoClockUndoDeadline,
} from './auto-clock/plan';
