/**
 * Two clocks on one record.
 *
 * `clockInAt` / `clockOutAt` are what HAPPENED: the instant a person stood at
 * the gate, with a position and a geofence verdict beside them. They are
 * evidence and are never adjusted.
 *
 * The counted window is what COUNTS: the part of that time the organization
 * asked for and agreed to pay. Arriving twenty minutes early is generous, not
 * billable; lingering ten minutes after a shift is not overtime.
 *
 * Everything here is pure. It is the only place either question is answered, so
 * the timesheet, the phone, the exports and the payroll figure cannot disagree —
 * and so a change to how hours are counted is one function and one test file
 * rather than an archaeology expedition.
 */

export interface CountedTimeInput {
  clockInAt: Date;
  /** Null while the shift is still open — used for the live figure on screen. */
  clockOutAt?: Date | null;
  /**
   * The shift's expected start and end as absolute instants, or null when no
   * shift was resolved at clock-in (task work, a flexible space, a member with
   * no rota). With no expectation there is nothing to clamp to and the counted
   * window is simply the real one.
   */
  expectedStartAt?: Date | null;
  expectedEndAt?: Date | null;
  /**
   * The shift's own tolerance. Arriving inside it is arriving on time — which is
   * what tolerance already means everywhere else in this system — so the count
   * snaps to the scheduled boundary rather than docking somebody for a traffic
   * light. Outside it, the real time is used and the entry is flagged.
   */
  toleranceMin?: number;
  /**
   * Minutes of break that do not count as work. Paid breaks are not in here.
   * Only read when `rests` is absent — a row without rest rows (an entry from
   * before rests were rows, the live figure on the phone).
   */
  unpaidBreakMinutes?: number;
  /**
   * The rests themselves, when the caller has the rows. ⚠️ Preferred over the
   * total: only the part of an unpaid rest INSIDE the counted window comes off.
   * A rest taken before the shift began (in at 08:00, rest 08:00–08:30, shift
   * from 09:00) was never counted, so taking it off again docked 30 minutes
   * twice. Paid rests and rests still running are ignored.
   */
  rests?: readonly CountedRest[];
}

/** A rest as the count reads it — structurally a break row. */
export interface CountedRest {
  startedAt: Date;
  endedAt?: Date | null;
  isPaid?: boolean | null;
  /** When shorter than the two times say, the shorter figure is what was rested. */
  durationMinutes?: number | null;
}

export interface CountedTime {
  countedStartAt: Date;
  countedEndAt: Date | null;
  /** Null while the shift is open; a whole number of minutes, never negative. */
  paidMinutes: number | null;
  /** True when a clamp actually moved something — the screen says so, plainly. */
  clamped: boolean;
}

const MIN = 60_000;

/**
 * Snap to a scheduled boundary when the real time is within tolerance of it.
 *
 * Applied in BOTH directions on purpose. A member who arrives two minutes late
 * is not docked two minutes, and one who arrives two minutes early is not paid
 * for them: inside the tolerance, the scheduled time is the truth. That
 * symmetry is what makes it a tolerance rather than a rounding rule that always
 * favours one side.
 */
function snap(actual: Date, boundary: Date, toleranceMin: number): Date {
  const driftMin = Math.abs(actual.getTime() - boundary.getTime()) / MIN;
  return driftMin <= toleranceMin ? boundary : actual;
}

export function computeCountedTime(input: CountedTimeInput): CountedTime {
  const tol = Math.max(0, input.toleranceMin ?? 0);

  /*
    The start: the LATER of arriving and the shift beginning.

    Early is not paid — the shift had not started. Late is not credited — he was
    not there. One `max`, both directions, no branch to get wrong.
  */
  let countedStartAt = input.clockInAt;
  if (input.expectedStartAt) {
    const snapped = snap(input.clockInAt, input.expectedStartAt, tol);
    countedStartAt = snapped > input.expectedStartAt ? snapped : input.expectedStartAt;
  }

  /*
    The end: the EARLIER of leaving and the shift ending.

    And this is where approved overtime needs no special case at all — approving
    it MOVES `expectedEndAt`, so the same `min` pays up to the new end and not a
    minute beyond. Approved overtime is paid, unapproved overtime is not, and
    one line decides both.
  */
  let countedEndAt: Date | null = input.clockOutAt ?? null;
  if (countedEndAt && input.expectedEndAt) {
    const snapped = snap(countedEndAt, input.expectedEndAt, tol);
    countedEndAt = snapped < input.expectedEndAt ? snapped : input.expectedEndAt;
  }

  /*
    A shift somebody left before it started, or a clamp that crossed itself,
    is zero — never a negative number of minutes. Payroll subtracting a negative
    is the kind of arithmetic that is only ever found by the person it underpaid.
  */
  const paidMinutes =
    countedEndAt === null
      ? null
      : input.rests
        ? Math.max(
            0,
            Math.round(
              (countedEndAt.getTime() - countedStartAt.getTime() - unpaidRestMs(input.rests, countedStartAt, countedEndAt)) /
                MIN,
            ),
          )
        : Math.max(
            0,
            Math.round((countedEndAt.getTime() - countedStartAt.getTime()) / MIN) -
              Math.max(0, Math.round(input.unpaidBreakMinutes ?? 0)),
          );

  const clamped =
    countedStartAt.getTime() !== input.clockInAt.getTime() ||
    (!!input.clockOutAt && !!countedEndAt && countedEndAt.getTime() !== input.clockOutAt.getTime());

  return { countedStartAt, countedEndAt, paidMinutes, clamped };
}

/**
 * The unpaid rest INSIDE [from, to], in exact milliseconds — rounded once, by
 * the caller, with the window it comes off. Rests are clipped one by one; two
 * rows that overlap each other (a hand-added duplicate) still cannot take off
 * more than the window holds, because the result is capped at it.
 */
export function unpaidRestMs(rests: readonly CountedRest[], from: Date, to: Date): number {
  let ms = 0;
  for (const r of rests) {
    if (r.isPaid || !r.endedAt) continue;
    const start = Math.max(r.startedAt.getTime(), from.getTime());
    const end = Math.min(r.endedAt.getTime(), to.getTime());
    if (end <= start) continue;
    const cap = r.durationMinutes != null ? Math.max(0, r.durationMinutes) * MIN : Infinity;
    ms += Math.min(end - start, cap);
  }
  return Math.min(ms, Math.max(0, to.getTime() - from.getTime()));
}

/**
 * How far short of the shift a clock-out falls, in whole minutes; 0 when the
 * shift was completed or there was no shift to complete.
 *
 * Read twice — once by the phone, to ask "you are 1h 20m short, why?" before the
 * clock-out goes through, and once by the server, which asks the same question
 * again because a client-side confirmation is a suggestion.
 */
export function shortfallMinutes(input: {
  clockOutAt: Date;
  expectedEndAt?: Date | null;
  toleranceMin?: number;
}): number {
  if (!input.expectedEndAt) return 0;
  const tol = Math.max(0, input.toleranceMin ?? 0);
  const shortMin = (input.expectedEndAt.getTime() - input.clockOutAt.getTime()) / MIN;
  return shortMin > tol ? Math.round(shortMin) : 0;
}

/** Minutes of a shift that are expected to be worked, net of unpaid breaks. */
export function expectedPaidMinutes(input: {
  expectedStartAt?: Date | null;
  expectedEndAt?: Date | null;
  unpaidBreakMinutes?: number;
}): number | null {
  if (!input.expectedStartAt || !input.expectedEndAt) return null;
  const gross = Math.round((input.expectedEndAt.getTime() - input.expectedStartAt.getTime()) / MIN);
  return Math.max(0, gross - Math.max(0, Math.round(input.unpaidBreakMinutes ?? 0)));
}
