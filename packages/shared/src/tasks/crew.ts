import { jobWindows, selfBlockWindows, type WorkTimelineEvent } from './job-time';

/**
 * A CREW on one job — ONE rule for the server, the web and the phone.
 *
 * The job has ONE step, moved by its leader. Each person on it has their OWN
 * presence: joined → left, and their own stop ("My issue") → resumed. Time is
 * counted per person from their join to their leave, inside their own shift
 * (job-time.ts), in the job's kind of time — `blocked` while they are stopped.
 *
 * Why it is split this way: credit used to start only at a person's own step
 * move, so in a crew where one person taps, everybody else counted 0; three
 * people tapping "On the way" together credited the first; and one person's
 * issue turned the whole crew's working time into blocked time.
 */

/** Confirming "I'm with him" this soon after the leader started counts from the leader's start. */
export const CREW_JOIN_CONFIRM_MINUTES = 30;
/** Longest reason kept for a stop, a leader change or an office join. */
export const CREW_REASON_MAX = 500;

/** Refusal codes the screens translate. */
export const CREW_CODES = {
  /** The caller is not on this job's crew. */
  NOT_ON_CREW: 'CREW_NOT_ON_CREW',
  /** The caller has not joined the job (or has left it). */
  NOT_JOINED: 'CREW_NOT_JOINED',
  /** Crew mode: only the leader (or the acting leader, or the office) moves the job's step. */
  LEADER_MOVES_STEPS: 'CREW_LEADER_MOVES_STEPS',
  /** The new leader must already be on this job's crew. */
  LEAD_TARGET_NOT_ON_CREW: 'CREW_LEAD_TARGET_NOT_ON_CREW',
  /** Only this job's leader, or the office, hands its lead over. */
  LEAD_NOT_YOURS: 'CREW_LEAD_NOT_YOURS',
  /** Joining needs the job to be under way (a counted step). */
  JOB_NOT_STARTED: 'CREW_JOB_NOT_STARTED',
} as const;

export type LeadScope = 'TODAY' | 'PERMANENT';
export const LEAD_SCOPES: readonly LeadScope[] = ['TODAY', 'PERMANENT'];

/** Where somebody stands on a job right now. */
export interface CrewPresence {
  joined: boolean;
  /** When the current stretch on the job began (epoch ms), or null. */
  since: number | null;
  /** When their last stretch on the job ended (epoch ms) — a new join can never count from before it. */
  lastLeftAt: number | null;
  /** Stopped on their own ("My issue"), and since when, and why. */
  selfBlockedSince: number | null;
  selfBlockReason: string | null;
}

/** Each person's presence on a job, from its history. */
export function crewPresence(events: readonly WorkTimelineEvent[], people: readonly string[]): Map<string, CrewPresence> {
  const out = new Map<string, CrewPresence>();
  for (const id of people) {
    const windows = jobWindows(events, id);
    const open = windows.find(([, end]) => end === Infinity);
    const closed = windows.filter(([, end]) => end !== Infinity);
    const stop = open ? selfBlockWindows(events, id).find(([, end]) => end === Infinity) : undefined;
    const why = stop
      ? events.find((e) => e.kind === 'SELF_BLOCKED' && e.userId === id && new Date(e.at).getTime() === stop[0])?.reason ?? null
      : null;
    out.set(id, {
      joined: !!open,
      since: open ? open[0] : null,
      lastLeftAt: closed.length ? closed[closed.length - 1]![1] : null,
      selfBlockedSince: stop ? stop[0] : null,
      selfBlockReason: why,
    });
  }
  return out;
}

/**
 * When a join counts from.
 *
 * Their own tap: then. Confirming the leader's start ("I'm with him") within
 * CREW_JOIN_CONFIRM_MINUTES: from the leader's start — they were there — but
 * never before their own clock-in, and never after the tap itself.
 */
export function joinMoment(args: {
  tapAt: number;
  leaderStartAt?: number | null;
  clockInAt?: number | null;
  windowMinutes?: number;
}): number {
  const { tapAt, leaderStartAt, clockInAt } = args;
  const window = (args.windowMinutes ?? CREW_JOIN_CONFIRM_MINUTES) * 60_000;
  if (leaderStartAt == null || !Number.isFinite(leaderStartAt) || leaderStartAt > tapAt || tapAt - leaderStartAt > window) return tapAt;
  const floor = clockInAt != null && Number.isFinite(clockInAt) ? Math.max(leaderStartAt, clockInAt) : leaderStartAt;
  return Math.min(floor, tapAt);
}

/** Who leads a job now, and why. */
export interface EffectiveLeader {
  userId: string | null;
  /** True when it is not the named leader — the automatic stand-in for today. */
  acting: boolean;
  source: 'TODAY' | 'LEAD' | 'ACTING' | 'NONE';
}

/**
 * Who moves the job's step right now.
 *
 * A hand-over for today, while it lasts and that person is on the clock; else
 * the named leader, while on the clock; else — so a job is never stuck behind
 * one absent person — the first crew member who joined and is on the clock,
 * for today only. With nobody on the clock it stays with whoever is named.
 */
export function effectiveLeader(args: {
  leadId: string | null;
  today?: { userId: string; until: number } | null;
  now: number;
  onClock: ReadonlySet<string>;
  /** Crew members currently joined, in the order they joined. */
  joinedInOrder: readonly string[];
  /**
   * The whole crew, in its own order. Before anybody has joined (the job not
   * started), the first of them on the clock stands in — or a job whose leader
   * is off sick could never be started at all.
   */
  crewInOrder?: readonly string[];
}): EffectiveLeader {
  const crew = args.crewInOrder ? new Set(args.crewInOrder) : null;
  // A hand-over for today only holds while that person is still on this job's crew.
  const today = args.today && args.today.until > args.now && (!crew || crew.has(args.today.userId)) ? args.today.userId : null;
  if (today && args.onClock.has(today)) return { userId: today, acting: false, source: 'TODAY' };
  if (args.leadId && args.onClock.has(args.leadId)) return { userId: args.leadId, acting: false, source: 'LEAD' };
  const absent = (id: string) => id !== args.leadId && id !== today;
  const stand = args.joinedInOrder.find((id) => args.onClock.has(id) && absent(id))
    ?? args.crewInOrder?.find((id) => args.onClock.has(id) && absent(id));
  if (stand) return { userId: stand, acting: true, source: 'ACTING' };
  const named = today ?? args.leadId;
  return named ? { userId: named, acting: false, source: today ? 'TODAY' : 'LEAD' } : { userId: null, acting: false, source: 'NONE' };
}

/**
 * May this person move the job's step?
 *
 * The office always may. Somebody not on the crew never may. Without crew
 * mode, anybody on the crew may (as before). With it, the effective leader —
 * or anybody, when nobody leads.
 */
export function mayMoveStep(args: {
  actorId: string;
  isOffice: boolean;
  onCrew: boolean;
  crewMode: boolean;
  leader: EffectiveLeader;
}): { ok: true } | { ok: false; code: string } {
  if (args.isOffice) return { ok: true };
  if (!args.onCrew) return { ok: false, code: CREW_CODES.NOT_ON_CREW };
  if (!args.crewMode || !args.leader.userId || args.leader.userId === args.actorId) return { ok: true };
  return { ok: false, code: CREW_CODES.LEADER_MOVES_STEPS };
}

/**
 * Does a person's clock-out pause the job? Only when nobody ELSE who has
 * joined is still on the clock — a job never runs with nobody counted on it,
 * and never stops under somebody still working it.
 */
export function pausesAtClockOut(args: { leaverId: string; joined: readonly string[]; onClock: ReadonlySet<string> }): boolean {
  return !args.joined.some((id) => id !== args.leaverId && args.onClock.has(id));
}

/** How far a zone's wall clock is ahead of UTC at an instant (ms). */
function zoneOffset(at: number, timeZone: string): number {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(at))
    .reduce<Record<string, string>>((m, x) => ((m[x.type] = x.value), m), {});
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(at / 1000) * 1000;
}

/**
 * The end of a calendar day in a time zone — when a hand-over "for today" runs
 * out. The next local midnight, found from the zone's own offset, so a day
 * that is 23 or 25 hours long (a clock change) still ends at midnight.
 */
export function endOfLocalDay(at: Date, timeZone: string): Date {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(at)
    .reduce<Record<string, string>>((m, x) => ((m[x.type] = x.value), m), {});
  const nextMidnightWall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1);
  let utc = nextMidnightWall - zoneOffset(nextMidnightWall, timeZone);
  utc = nextMidnightWall - zoneOffset(utc, timeZone); // settle across an offset change
  return new Date(utc - 1);
}
