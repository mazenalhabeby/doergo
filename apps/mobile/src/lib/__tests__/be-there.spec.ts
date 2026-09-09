import {
  departureAdvice,
  leaveAtFor,
  straightLineTravel,
  hasAppointmentTime,
  needsTravelEstimate,
  sameSiteDay,
  endOfSiteDay,
  DEFAULT_PREP_SECONDS,
  PLENTY_MINUTES,
} from '@hbcfield/shared/client';

/**
 * Getting somebody to a client for one o'clock.
 *
 * The stored fact is the arrival time. Everything the member is told — when to
 * set off, whether they are about to be late — is derived from that plus where
 * they are right now, so these tests are all arithmetic against a fixed clock.
 */
const at = (iso: string) => new Date(iso);
const route = (mins: number) => ({ seconds: mins * 60, source: 'route' as const });

describe('when to set off', () => {
  it('subtracts the drive and the getting-going', () => {
    // 13:00 appointment, 42 minutes of driving, 5 minutes of prep.
    const leave = leaveAtFor(at('2026-09-10T13:00:00Z'), 42 * 60);
    expect(leave.toISOString()).toBe('2026-09-10T12:13:00.000Z');
    expect(DEFAULT_PREP_SECONDS).toBe(300);
  });

  it('says GO when the moment arrives', () => {
    const a = departureAdvice({
      now: at('2026-09-10T12:13:00Z'),
      appointment: at('2026-09-10T13:00:00Z'),
      travel: route(42),
    });
    expect(a.state).toBe('go');
    expect(a.minutesUntilLeave).toBe(0);
    expect(a.lateByMinutes).toBe(0);
  });

  it('counts down while departure is close', () => {
    const a = departureAdvice({
      now: at('2026-09-10T12:00:00Z'),
      appointment: at('2026-09-10T13:00:00Z'),
      travel: route(42),
    });
    expect(a.state).toBe('soon');
    expect(a.minutesUntilLeave).toBe(13);
  });

  it('stays quiet when there is plenty of time', () => {
    const a = departureAdvice({
      now: at('2026-09-10T08:00:00Z'),
      appointment: at('2026-09-10T13:00:00Z'),
      travel: route(42),
    });
    expect(a.state).toBe('plenty');
    expect(a.minutesUntilLeave).toBeGreaterThan(PLENTY_MINUTES);
  });

  /*
    Once the moment has gone, "leave now" is a lie. The member is going to be
    late and the useful number is by how much — that is what lets them warn the
    client rather than discover it on arrival.
  */
  it('says how late, not "leave now", once departure has passed', () => {
    const a = departureAdvice({
      now: at('2026-09-10T12:40:00Z'),
      appointment: at('2026-09-10T13:00:00Z'),
      travel: route(42),
    });
    expect(a.state).toBe('late');
    expect(a.lateByMinutes).toBe(27); // 12:40 + 42 + 5 = 13:27
    expect(a.arriveAt?.toISOString()).toBe('2026-09-10T13:27:00.000Z');
  });

  it('drops the countdown entirely once they are at the site', () => {
    const a = departureAdvice({
      now: at('2026-09-10T12:40:00Z'),
      appointment: at('2026-09-10T13:00:00Z'),
      travel: route(42),
      atSite: true,
    });
    expect(a.state).toBe('arrived');
    expect(a.leaveAt).toBeNull();
  });
});

/**
 * ⚠️ The regression that would hit every organization at once: tasks created
 * before times existed carry a date-only value, which arrives as midnight.
 * Treating that as "be there at 00:00" would tell people to set off the night
 * before.
 */
describe('a date with no time', () => {
  it('is not an appointment', () => {
    expect(hasAppointmentTime(at('2026-09-10T00:00:00Z'))).toBe(false);
    expect(hasAppointmentTime(at('2026-09-10T13:00:00Z'))).toBe(true);
  });

  it('produces no advice at all', () => {
    const a = departureAdvice({
      now: at('2026-09-10T08:00:00Z'),
      appointment: at('2026-09-10T00:00:00Z'),
      travel: route(42),
    });
    expect(a.state).toBe('no-time');
    expect(a.leaveAt).toBeNull();
  });

  it('is judged in the SITE\'s day, not UTC', () => {
    // 23:00 UTC is midnight in Vienna (+60) — date-only, not an 11pm job.
    expect(hasAppointmentTime(at('2026-09-09T23:00:00Z'), 60)).toBe(false);
    // The same instant IS a time for a site on UTC.
    expect(hasAppointmentTime(at('2026-09-09T23:00:00Z'), 0)).toBe(true);
  });
});

describe('another day', () => {
  it('is a calendar entry, not a countdown', () => {
    const a = departureAdvice({
      now: at('2026-09-10T08:00:00Z'),
      appointment: at('2026-09-11T13:00:00Z'),
      travel: route(42),
    });
    expect(a.state).toBe('not-today');
  });

  it('rolls over at the site\'s midnight', () => {
    // 23:30 UTC on the 9th is already 00:30 on the 10th at a site one hour ahead.
    expect(sameSiteDay(at('2026-09-09T23:30:00Z'), at('2026-09-10T11:00:00Z'), 60)).toBe(true);
    // The same two instants are different days for a site on UTC.
    expect(sameSiteDay(at('2026-09-09T23:30:00Z'), at('2026-09-10T11:00:00Z'), 0)).toBe(false);
  });
});

/**
 * ⚠️ The bill. Google Routes charges per request, so the estimate is asked for
 * the job somebody is about to drive to — never for a list.
 */
describe('when it is worth asking the route engine', () => {
  const timed = { dueDate: '2026-09-10T13:00:00Z', locationLat: 47.98, locationLng: 13.82 };
  const now = at('2026-09-10T08:00:00Z');

  it('asks for a timed job today with somewhere to drive', () => {
    expect(needsTravelEstimate(timed, now)).toBe(true);
  });

  it('does not ask for a job with no location', () => {
    expect(needsTravelEstimate({ ...timed, locationLat: null, locationLng: null }, now)).toBe(false);
  });

  it('does not ask for a date-only job', () => {
    expect(needsTravelEstimate({ ...timed, dueDate: '2026-09-10T00:00:00Z' }, now)).toBe(false);
  });

  it('does not ask for another day', () => {
    expect(needsTravelEstimate({ ...timed, dueDate: '2026-09-12T13:00:00Z' }, now)).toBe(false);
  });

  it('does not ask when there is no date', () => {
    expect(needsTravelEstimate({ ...timed, dueDate: null }, now)).toBe(false);
  });
});

/**
 * The fallback exists so the feature still helps when the route engine is off
 * or the member's position is unknown.
 */
describe('with no route engine', () => {
  it('errs towards leaving early', () => {
    // 10km straight line → 13km of road at 45km/h ≈ 17.3 min.
    const t = straightLineTravel(10_000);
    expect(t.source).toBe('straight-line');
    expect(Math.round(t.seconds / 60)).toBe(17);
    // Longer than the naive straight-line figure, which would be ~13 min.
    expect(t.seconds).toBeGreaterThan((10 / 45) * 3600);
  });

  it('gives no advice rather than a wrong one when the origin is unknown', () => {
    const a = departureAdvice({
      now: at('2026-09-10T08:00:00Z'),
      appointment: at('2026-09-10T13:00:00Z'),
      travel: { seconds: 0, source: 'unknown' },
    });
    expect(a.state).toBe('plenty');
    expect(a.leaveAt).toBeNull();
  });
});

/**
 * ⚠️ The gate that would not let a US member start work.
 *
 * "Can I begin?" is answered against the end of TODAY, and today is a fact
 * about where the work is. The check used to build that from the server's
 * clock, and the server is a container running in UTC — so a job at 20:00 in
 * New York (01:00 the next day, UTC) looked like tomorrow's work and the member
 * was refused on the afternoon it was due.
 *
 * Invisible while due dates were dates: midnight local is the same UTC day on
 * either side of the Atlantic. Putting an hour on the date is what exposes it.
 */
describe('the end of today, where the work is', () => {
  it('ends the day at the site, not on the server', () => {
    // New York in September is UTC-4 → -240 minutes.
    const now = at('2026-09-10T18:00:00Z'); // 14:00 in New York
    const end = endOfSiteDay(now, -240);
    // 23:59:59.999 on the 10th in New York = 03:59:59.999 on the 11th, UTC.
    expect(end.toISOString()).toBe('2026-09-11T03:59:59.999Z');
  });

  it('lets a New York evening job start on its own afternoon', () => {
    const now = at('2026-09-10T18:00:00Z');          // 14:00 New York
    const due = at('2026-09-11T00:00:00Z');          // 20:00 New York, same day
    // The old UTC-based check: end of the 10th UTC = 23:59:59 UTC → REFUSED.
    const serverDay = new Date('2026-09-10T23:59:59.999Z');
    expect(due > serverDay).toBe(true);              // the bug

    // Judged at the site, the job is today and may be started.
    expect(due > endOfSiteDay(now, -240)).toBe(false);
  });

  it('still refuses genuinely future work', () => {
    const now = at('2026-09-10T18:00:00Z');
    const tomorrow = at('2026-09-11T14:00:00Z');     // 10:00 New York, next day
    expect(tomorrow > endOfSiteDay(now, -240)).toBe(true);
  });

  it('is unchanged for a site on UTC', () => {
    const end = endOfSiteDay(at('2026-09-10T12:00:00Z'), 0);
    expect(end.toISOString()).toBe('2026-09-10T23:59:59.999Z');
  });

  it('handles a site ahead of UTC', () => {
    // Vienna in September is UTC+2 → 23:59:59.999 local = 21:59:59.999 UTC.
    const end = endOfSiteDay(at('2026-09-10T12:00:00Z'), 120);
    expect(end.toISOString()).toBe('2026-09-10T21:59:59.999Z');
  });
});
