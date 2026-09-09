/**
 * "Be there at one o'clock" — worked backwards into when to set off.
 *
 * A client names an arrival time. The member needs a different number: the
 * moment to stop what they are doing and start driving. That is the appointment
 * minus the journey minus whatever it takes to get moving, and it moves as the
 * member moves — so it is COMPUTED wherever it is shown and never stored.
 *
 * ⚠️ Storing a "leave by" is the obvious design and it is wrong. It is written
 * during planning, from an origin that is a guess, and it is stale before the
 * day begins. The stored fact is the appointment; everything else is derived
 * from where the person actually is.
 *
 * Pure, and here rather than in a service, because both the phone and the
 * server have to reach the same answer — the screen counts down to a moment the
 * push notification also has to fire at, and two implementations would drift.
 */

/** How long the journey takes, and how much that number can be trusted. */
export interface TravelEstimate {
  seconds: number;
  /**
   * `route`        — a real road route from the engine.
   * `straight-line`— distance ÷ an assumed speed, because no engine answered.
   * `unknown`      — no origin or no destination; no advice can be given.
   */
  source: 'route' | 'straight-line' | 'unknown';
}

/**
 * What the member is being told right now.
 *
 * `late` is deliberately distinct from `go`: once the departure moment has
 * passed, telling somebody to "leave now" is no longer true — they are already
 * going to be late, and the honest message is how late.
 */
export type DepartureState =
  | 'no-time'    // the task has a date but no time — nothing to count down to
  | 'not-today'  // scheduled for another day
  | 'plenty'     // more than PLENTY_MINUTES before departure
  | 'soon'       // departure is close; worth showing a countdown
  | 'go'         // leave now
  | 'late'       // departure has passed; arrival will be after the appointment
  | 'arrived';   // already there — the drive is not the question any more

export interface DepartureAdvice {
  state: DepartureState;
  /** When to set off. Null when no journey estimate exists. */
  leaveAt: Date | null;
  /** Minutes until `leaveAt`; negative once it has passed. Null if unknown. */
  minutesUntilLeave: number | null;
  /** Projected arrival if they left now. Null if unknown. */
  arriveAt: Date | null;
  /** Minutes late on the appointment if they left now; 0 when on time. */
  lateByMinutes: number;
}

/**
 * Getting into the van, finding the keys, ending the previous job.
 *
 * A default rather than a setting: a number every organization has to configure
 * before the feature works is a feature most of them never switch on. Callers
 * may override it once there is a reason to.
 */
export const DEFAULT_PREP_SECONDS = 5 * 60;

/** Above this, a countdown is noise — the member is not going anywhere yet. */
export const PLENTY_MINUTES = 45;

/** Assumed average speed when there is no route engine, in km/h. */
export const FALLBACK_SPEED_KMH = 45;

const MIN = 60_000;

/**
 * Distance in a straight line → a journey estimate.
 *
 * ⚠️ Roads are not straight. The figure is multiplied by 1.3, the usual detour
 * ratio for road networks, so the fallback errs towards leaving EARLY. An
 * estimate that runs short makes somebody late, which is the failure this whole
 * feature exists to prevent.
 */
export function straightLineTravel(meters: number): TravelEstimate {
  if (!Number.isFinite(meters) || meters < 0) return { seconds: 0, source: 'unknown' };
  const roadMeters = meters * 1.3;
  return {
    seconds: Math.round((roadMeters / 1000 / FALLBACK_SPEED_KMH) * 3600),
    source: 'straight-line',
  };
}

/** The appointment, less the journey, less getting going. */
export function leaveAtFor(
  appointment: Date,
  travelSeconds: number,
  prepSeconds: number = DEFAULT_PREP_SECONDS,
): Date {
  return new Date(appointment.getTime() - (travelSeconds + prepSeconds) * 1000);
}

/**
 * Does this task carry a time, or only a date?
 *
 * ⚠️ Midnight means "no time given", not "be there at 00:00". Every task
 * created before times existed has a date-only value that arrives as midnight,
 * and counting those down would tell thousands of people to set off at eleven
 * the night before. A genuine midnight appointment is not a thing this product
 * needs to express.
 */
export function hasAppointmentTime(due: Date, timeZoneOffsetMinutes = 0): boolean {
  const local = new Date(due.getTime() + timeZoneOffsetMinutes * MIN);
  return local.getUTCHours() !== 0 || local.getUTCMinutes() !== 0;
}

/**
 * Everything the screen needs, from the three facts it has.
 *
 * `arrived` wins over every other state: once the member is at the site the
 * journey is history, and a card still counting down to "leave now" is worse
 * than no card.
 */
export function departureAdvice(input: {
  now: Date;
  appointment: Date | null;
  travel: TravelEstimate;
  prepSeconds?: number;
  /** Already at the site — from the geofence, not from the clock. */
  atSite?: boolean;
  /** Minutes to add to UTC to get the SITE's wall clock. */
  siteOffsetMinutes?: number;
}): DepartureAdvice {
  const { now, appointment, travel, atSite = false, siteOffsetMinutes = 0 } = input;
  const prep = input.prepSeconds ?? DEFAULT_PREP_SECONDS;

  const none: DepartureAdvice = {
    state: 'no-time', leaveAt: null, minutesUntilLeave: null, arriveAt: null, lateByMinutes: 0,
  };
  if (!appointment) return none;
  if (!hasAppointmentTime(appointment, siteOffsetMinutes)) return none;
  if (atSite) return { ...none, state: 'arrived' };

  // A different day is a calendar entry, not a countdown.
  if (!sameSiteDay(now, appointment, siteOffsetMinutes)) return { ...none, state: 'not-today' };

  if (travel.source === 'unknown') {
    return { ...none, state: 'plenty' };
  }

  const leaveAt = leaveAtFor(appointment, travel.seconds, prep);
  const minutesUntilLeave = Math.round((leaveAt.getTime() - now.getTime()) / MIN);
  const arriveAt = new Date(now.getTime() + (travel.seconds + prep) * 1000);
  const lateByMinutes = Math.max(0, Math.round((arriveAt.getTime() - appointment.getTime()) / MIN));

  const state: DepartureState =
    minutesUntilLeave > PLENTY_MINUTES ? 'plenty'
    : minutesUntilLeave > 0 ? 'soon'
    : lateByMinutes > 0 ? 'late'
    : 'go';

  return { state, leaveAt, minutesUntilLeave, arriveAt, lateByMinutes };
}

/**
 * The last instant of "today" WHERE THE WORK IS.
 *
 * ⚠️ `new Date(); d.setHours(23,59,59,999)` is the server's today, and the
 * server is a container running in UTC. For a site behind UTC that is hours too
 * early: a job at 20:00 in New York is 01:00 the next day in UTC, so the
 * "scheduled for a future date" gate refused to let anyone start it — on the
 * afternoon it was due. Putting an hour on a due date makes that an everyday
 * occurrence rather than an edge case.
 */
export function endOfSiteDay(now: Date, siteOffsetMinutes = 0): Date {
  const local = new Date(now.getTime() + siteOffsetMinutes * MIN);
  const endLocal = Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23, 59, 59, 999,
  );
  return new Date(endLocal - siteOffsetMinutes * MIN);
}

/** Same calendar day at the SITE, which is the only place the day matters. */
export function sameSiteDay(a: Date, b: Date, siteOffsetMinutes = 0): boolean {
  const shift = (d: Date) => new Date(d.getTime() + siteOffsetMinutes * MIN);
  const x = shift(a), y = shift(b);
  return x.getUTCFullYear() === y.getUTCFullYear()
    && x.getUTCMonth() === y.getUTCMonth()
    && x.getUTCDate() === y.getUTCDate();
}

/**
 * Is this task worth asking the route engine about?
 *
 * ⚠️ The gate that keeps the bill down. Google Routes is charged per request,
 * so the question is asked for the job somebody is actually about to drive to —
 * today, timed, with somewhere to drive — and never for a list of forty.
 */
export function needsTravelEstimate(task: {
  dueDate?: string | Date | null;
  locationLat?: number | null;
  locationLng?: number | null;
}, now: Date = new Date(), siteOffsetMinutes = 0): boolean {
  if (task.locationLat == null || task.locationLng == null) return false;
  if (!task.dueDate) return false;
  const due = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  if (!hasAppointmentTime(due, siteOffsetMinutes)) return false;
  return sameSiteDay(now, due, siteOffsetMinutes);
}

/** The i18n key for each state, so the phone and the web say the same thing. */
export const DEPARTURE_STATE_KEY: Record<DepartureState, string> = {
  'no-time': 'tasks.beThere.noTime',
  'not-today': 'tasks.beThere.notToday',
  plenty: 'tasks.beThere.plenty',
  soon: 'tasks.beThere.soon',
  go: 'tasks.beThere.go',
  late: 'tasks.beThere.late',
  arrived: 'tasks.beThere.arrived',
};
