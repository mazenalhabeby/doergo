/**
 * When did it really happen — and can we believe it?
 *
 * An action recorded offline (a clock-in, a status change, a photo) reaches the
 * server minutes or days later. The server used to stamp its own `new Date()`
 * on arrival, so a 07:58 clock-in synced at 11:14 read 11:14, and the geofence
 * was judged against wherever the phone happened to be at sync time.
 *
 * So every time-sensitive action carries the evidence of the tap, and ONE rule
 * — this file, run on the phone for an instant answer and on the server for
 * the decision — says what that evidence is worth.
 *
 * ⚠️ The phone's wall clock is a claim, not a fact: anyone can move it. The
 * check that catches that is the ANCHOR — the server time from the phone's last
 * successful response, paired with the phone's monotonic uptime at that moment.
 * Uptime cannot be set by the user, so `anchor.serverTime + (uptime now −
 * uptime then)` estimates the real time independently of the clock.
 *
 * Trust, but show it: a suspicious clock is FLAGGED for a person to judge, never
 * silently believed and never silently thrown away. Only the physically
 * impossible (the future, or before the thing it follows) is refused.
 */

/** A GPS fix taken at the moment of the tap. */
export interface OccurrenceFix {
  lat: number;
  lng: number;
  /** Metres, as the phone reports it. */
  accuracy: number;
  /** When the fix was taken (device clock, ISO). */
  fixAt: string;
  /** Android reports locations produced by a mock-location app. */
  mocked?: boolean;
}

/** Everything a phone records about when (and where) an action happened. */
export interface OccurrenceEvidence {
  /** Device wall clock at the tap, ISO 8601 with offset. */
  occurredAt: string;
  /** Monotonic milliseconds since boot at the tap. */
  uptimeMs?: number;
  /** The last server contact before the tap. */
  anchor?: { serverTime: string; uptimeMs: number };
  fix?: OccurrenceFix;
}

/** Facts about an occurrence worth showing to the person who approves it. */
export type OccurrenceFlag =
  /** Arrived noticeably after it happened. Informational. */
  | 'RECORDED_OFFLINE'
  /** The phone restarted, or never reached the server first — the clock could not be cross-checked. Informational. */
  | 'UNANCHORED'
  /** The phone clock disagrees with the anchored estimate. Needs a person. */
  | 'CLOCK_SUSPECT'
  /** Older than the window an offline record is expected in. Needs a person. */
  | 'STALE';

export type OccurrenceRefusal = 'OCCURRED_AT_INVALID' | 'OCCURRED_IN_FUTURE' | 'OUT_OF_ORDER';

export interface OccurrenceAssessment {
  /** The time to record. Always the phone's claim when accepted — the flags say how much to trust it. */
  occurredAt: Date;
  flags: OccurrenceFlag[];
  refusal?: { code: OccurrenceRefusal; message: string };
}

/** Tunables, exported so a test can name them and the server and phone agree. */
export const OCCURRENCE_RULES = {
  /** Phones drift; a clock this far ahead is still "now". */
  FUTURE_TOLERANCE_MS: 2 * 60 * 1000,
  /** Arriving later than this counts as recorded offline. */
  OFFLINE_AFTER_MS: 2 * 60 * 1000,
  /** Anchored estimate vs claimed time: beyond this the clock is suspect. */
  CLOCK_SKEW_TOLERANCE_MS: 5 * 60 * 1000,
  /** Older than this goes to a person rather than counting on its own. */
  STALE_AFTER_MS: 7 * 24 * 60 * 60 * 1000,
  /** A fix taken this long before or after the tap is not a fix of the tap. */
  FIX_MAX_GAP_MS: 2 * 60 * 1000,
  /** Same bound the clock-in has always used. */
  FIX_MAX_ACCURACY_M: 100,
} as const;

/**
 * Judge an occurrence.
 *
 * @param previousAt the time of the event this one must follow (the clock-in a
 *   clock-out closes, the status a transition leaves) — refuse if earlier.
 */
export function assessOccurrence(
  evidence: Pick<OccurrenceEvidence, 'occurredAt' | 'uptimeMs' | 'anchor'>,
  opts: { now: Date; previousAt?: Date | null },
): OccurrenceAssessment {
  const occurredAt = new Date(evidence.occurredAt);
  const flags: OccurrenceFlag[] = [];
  if (!evidence.occurredAt || Number.isNaN(occurredAt.getTime())) {
    return { occurredAt: opts.now, flags, refusal: { code: 'OCCURRED_AT_INVALID', message: 'The time of this action could not be read' } };
  }
  const now = opts.now.getTime();
  const at = occurredAt.getTime();

  if (at > now + OCCURRENCE_RULES.FUTURE_TOLERANCE_MS) {
    return {
      occurredAt,
      flags,
      refusal: { code: 'OCCURRED_IN_FUTURE', message: "This phone's clock is ahead — check its date and time settings" },
    };
  }
  if (opts.previousAt && at < opts.previousAt.getTime()) {
    return {
      occurredAt,
      flags,
      refusal: { code: 'OUT_OF_ORDER', message: 'This happened before the step it follows' },
    };
  }

  const anchorAt = evidence.anchor ? new Date(evidence.anchor.serverTime).getTime() : NaN;
  const hasUptime = typeof evidence.uptimeMs === 'number' && Number.isFinite(evidence.uptimeMs);
  if (!evidence.anchor || Number.isNaN(anchorAt) || !hasUptime || evidence.uptimeMs! < evidence.anchor.uptimeMs) {
    // No anchor, or uptime went backwards — the phone restarted since its last
    // server contact, so the estimate chain is broken. Not an accusation.
    flags.push('UNANCHORED');
  } else {
    const estimate = anchorAt + (evidence.uptimeMs! - evidence.anchor.uptimeMs);
    if (Math.abs(estimate - at) > OCCURRENCE_RULES.CLOCK_SKEW_TOLERANCE_MS) flags.push('CLOCK_SUSPECT');
  }

  if (now - at > OCCURRENCE_RULES.OFFLINE_AFTER_MS) flags.push('RECORDED_OFFLINE');
  if (now - at > OCCURRENCE_RULES.STALE_AFTER_MS) flags.push('STALE');

  return { occurredAt, flags };
}

export type FixRefusal = 'FIX_MISSING' | 'FIX_MOCKED' | 'FIX_INACCURATE' | 'FIX_NOT_AT_TAP';

/**
 * Is this GPS fix evidence of where the tap happened?
 *
 * A fix an hour old, a fix from a mock-location app, or one 400 m wide says
 * nothing about where somebody stood when they clocked in.
 */
export function assessFix(
  fix: OccurrenceFix | undefined | null,
  occurredAt: Date,
): { ok: true } | { ok: false; code: FixRefusal; message: string } {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) {
    return { ok: false, code: 'FIX_MISSING', message: 'Your location could not be determined' };
  }
  // 0,0 is a real point in the Gulf of Guinea, and what a missing fix used to be sent as.
  if (fix.lat === 0 && fix.lng === 0) {
    return { ok: false, code: 'FIX_MISSING', message: 'Your location could not be determined' };
  }
  if (fix.mocked) return { ok: false, code: 'FIX_MOCKED', message: 'A mock-location app is providing your position' };
  if (!Number.isFinite(fix.accuracy) || fix.accuracy > OCCURRENCE_RULES.FIX_MAX_ACCURACY_M) {
    return { ok: false, code: 'FIX_INACCURATE', message: 'Your location is not precise enough yet' };
  }
  const fixAt = new Date(fix.fixAt).getTime();
  if (Number.isNaN(fixAt) || Math.abs(fixAt - occurredAt.getTime()) > OCCURRENCE_RULES.FIX_MAX_GAP_MS) {
    return { ok: false, code: 'FIX_NOT_AT_TAP', message: 'Your location was not taken at the moment of the action' };
  }
  return { ok: true };
}

/**
 * Flags that describe HOW something was recorded, not whether it is right.
 *
 * An entry recorded offline, or on a phone that restarted in the meantime, is
 * shown as such — and still counts on its own. Sending every basement shift to
 * a review queue would teach managers to approve the queue without reading it,
 * which costs the entries that genuinely need a look (a moved clock, a mock
 * location). Those are NOT in this set.
 */
export const INFORMATIONAL_FLAGS: ReadonlySet<string> = new Set(['RECORDED_OFFLINE', 'UNANCHORED']);

/** The flags on an entry that should put it in front of a person. */
export function flagsForReview(flags: readonly string[]): string[] {
  return flags.filter((f) => !INFORMATIONAL_FLAGS.has(f));
}

/** Flags that stop an entry counting on its own until a person looks at it. */
const NEEDS_A_PERSON: ReadonlySet<string> = new Set(['CLOCK_SUSPECT', 'STALE', 'BOUNDARY_CHANGED', 'ASSIGNMENT_CHANGED']);

export function occurrenceNeedsApproval(flags: readonly string[]): boolean {
  return flags.some((f) => NEEDS_A_PERSON.has(f));
}
