/**
 * A crew on one job (packages/shared/src/tasks/crew.ts + job-time.ts):
 * the day from the mockup, under the old rules and the crew rules.
 */
import {
  crewPresence,
  effectiveLeader,
  endOfLocalDay,
  exclusiveSpans,
  jobSpans,
  jobTimeAt,
  jobWindows,
  joinMoment,
  mayMoveStep,
  pausesAtClockOut,
  personalSpans,
  selfBlockWindows,
  shiftsWithoutRests,
  stepTimeKind,
  workerJobTime,
  CREW_CODES,
  type JobTime,
  type ShiftSpan,
  type WorkTimelineEvent,
} from '@hbcfield/shared';

const T = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00Z`);
const ms = (hhmm: string) => T(hhmm).getTime();
const kindOf = (s: string) => stepTimeKind(s, s === 'EN_ROUTE' ? ['gps', 'timer'] : s === 'ACCEPTED' || s === 'COMPLETED' ? [] : ['timer']);
const ev = (at: string, userId: string, kind: WorkTimelineEvent['kind'], status?: string): WorkTimelineEvent => ({ at: T(at), userId, kind, status });

/** One person's share of one job — the same pipeline JobTimeService runs. */
function share(events: WorkTimelineEvent[], who: string, shifts: ShiftSpan[], until = T('20:00')): JobTime {
  const spans = jobSpans(events, until, kindOf);
  const mine = exclusiveSpans([{ id: 'job', spans, windows: jobWindows(events, who) }]).get('job') ?? [];
  return workerJobTime(personalSpans(mine, selfBlockWindows(events, who)), -Infinity, shifts);
}
const total = (t: JobTime) => t.travel + t.working + t.blocked;

const shiftsOf = {
  tobias: shiftsWithoutRests([{ start: T('07:00'), end: T('15:00'), rests: [{ start: T('12:00'), end: T('12:30') }] }], T('20:00')),
  priya: [{ start: T('07:00'), end: T('16:00') }],
  conor: [{ start: T('07:00'), end: T('17:00') }],
};

describe('the crew day — the rules before crew mode', () => {
  const events = [
    ev('07:30', 'tobias', 'STATUS', 'EN_ROUTE'),
    ev('08:00', 'tobias', 'STATUS', 'IN_PROGRESS'),
    ev('13:00', 'priya', 'STATUS', 'BLOCKED'),
    ev('13:40', 'priya', 'STATUS', 'IN_PROGRESS'),
    ev('17:00', 'conor', 'PAUSED'),
  ];

  it('credits only who tapped: 7h / 3h / 0 — the problem the crew rules fix', () => {
    expect(share(events, 'tobias', shiftsOf.tobias)).toEqual({ travel: 30, working: 350, blocked: 40 });
    expect(share(events, 'priya', shiftsOf.priya)).toEqual({ travel: 0, working: 140, blocked: 40 });
    // Conor only paused it (his clock-out): pausing is not joining.
    expect(total(share(events, 'conor', shiftsOf.conor))).toBe(0);
  });
});

describe('the crew day — crew rules', () => {
  const events = [
    ev('07:30', 'tobias', 'STATUS', 'EN_ROUTE'),
    // "I'm with him", confirmed within the window: joined at the leader's start.
    ev('07:30', 'priya', 'JOINED'),
    ev('07:30', 'conor', 'JOINED'),
    ev('08:00', 'tobias', 'STATUS', 'IN_PROGRESS'),
    // Priya waits for a part; the job and the others carry on working.
    ev('13:00', 'priya', 'SELF_BLOCKED'),
    ev('13:40', 'priya', 'SELF_RESUMED'),
    ev('15:00', 'tobias', 'LEFT'),
    ev('16:00', 'priya', 'LEFT'),
    ev('17:00', 'conor', 'LEFT'),
    ev('17:00', 'conor', 'PAUSED'),
  ];

  it('counts everybody from their join: 7h / 8h30 / 9h30 = 25h', () => {
    const t = share(events, 'tobias', shiftsOf.tobias);
    const p = share(events, 'priya', shiftsOf.priya);
    const c = share(events, 'conor', shiftsOf.conor);
    expect(t).toEqual({ travel: 30, working: 390, blocked: 0 });
    expect(p).toEqual({ travel: 30, working: 440, blocked: 40 });
    expect(c).toEqual({ travel: 30, working: 540, blocked: 0 });
    expect(total(t) + total(p) + total(c)).toBe(25 * 60);
  });

  it("one person's stop never changes the job's own line", () => {
    const spans = jobSpans(events, T('20:00'), kindOf);
    expect(spans.every((s) => s.kind !== 'blocked')).toBe(true);
  });

  it('presence: who is on the job at 13:10', () => {
    const at = events.filter((e) => new Date(e.at) <= T('13:10'));
    const p = crewPresence(at, ['tobias', 'priya', 'conor']);
    expect(p.get('tobias')).toMatchObject({ joined: true, selfBlockedSince: null });
    expect(p.get('priya')).toMatchObject({ joined: true, selfBlockedSince: ms('13:00') });
    expect(crewPresence(events, ['tobias']).get('tobias')).toMatchObject({ joined: false, lastLeftAt: ms('15:00') });
    expect(p.get('conor')?.since).toBe(ms('07:30'));
  });

  it('a stop ends when the person leaves', () => {
    const evs = [ev('08:00', 'a', 'STATUS', 'IN_PROGRESS'), ev('09:00', 'a', 'SELF_BLOCKED'), ev('10:00', 'a', 'LEFT')];
    expect(selfBlockWindows(evs, 'a')).toEqual([[ms('09:00'), ms('10:00')]]);
  });
});

describe('three people tap "On the way" together', () => {
  it('credits all three from their own tap', () => {
    const events = [ev('07:30', 'a', 'STATUS', 'EN_ROUTE'), ev('07:30', 'b', 'JOINED'), ev('07:31', 'c', 'JOINED'), ev('08:00', 'a', 'STATUS', 'IN_PROGRESS')];
    const shift = [{ start: T('07:00'), end: T('09:00') }];
    expect(share(events, 'a', shift)).toEqual({ travel: 30, working: 60, blocked: 0 });
    expect(share(events, 'b', shift)).toEqual({ travel: 30, working: 60, blocked: 0 });
    expect(share(events, 'c', shift)).toEqual({ travel: 29, working: 60, blocked: 0 });
  });
});

describe('joinMoment', () => {
  const leader = ms('07:30');
  it('confirming within 30 minutes counts from the leader start', () => {
    expect(joinMoment({ tapAt: ms('07:50'), leaderStartAt: leader, clockInAt: ms('07:00') })).toBe(leader);
  });
  it('never before their own clock-in', () => {
    expect(joinMoment({ tapAt: ms('07:50'), leaderStartAt: leader, clockInAt: ms('07:40') })).toBe(ms('07:40'));
  });
  it('late confirmations count from the tap', () => {
    expect(joinMoment({ tapAt: ms('08:10'), leaderStartAt: leader, clockInAt: ms('07:00') })).toBe(ms('08:10'));
  });
  it('a leader start after the tap is ignored', () => {
    expect(joinMoment({ tapAt: ms('07:20'), leaderStartAt: leader })).toBe(ms('07:20'));
  });
});

describe('effectiveLeader — a job is never stuck behind one absent person', () => {
  const now = ms('09:00');
  it('the leader leads while on the clock', () => {
    expect(effectiveLeader({ leadId: 't', now, onClock: new Set(['t', 'p']), joinedInOrder: ['p'] })).toEqual({ userId: 't', acting: false, source: 'LEAD' });
  });
  it('the first joined member on the clock stands in, automatically', () => {
    expect(effectiveLeader({ leadId: 't', now, onClock: new Set(['p', 'c']), joinedInOrder: ['c', 'p'] })).toEqual({ userId: 'c', acting: true, source: 'ACTING' });
  });
  it("today's hand-over wins while it lasts", () => {
    expect(effectiveLeader({ leadId: 't', today: { userId: 'p', until: ms('23:59') }, now, onClock: new Set(['t', 'p']), joinedInOrder: [] }).userId).toBe('p');
    expect(effectiveLeader({ leadId: 't', today: { userId: 'p', until: ms('08:00') }, now, onClock: new Set(['t', 'p']), joinedInOrder: [] }).userId).toBe('t');
  });
  it('before anybody joined, the first crew member on the clock stands in (a job with a sick leader can start)', () => {
    expect(effectiveLeader({ leadId: 't', now, onClock: new Set(['c', 'p']), joinedInOrder: [], crewInOrder: ['t', 'p', 'c'] })).toEqual({ userId: 'p', acting: true, source: 'ACTING' });
  });
  it("today's hand-over to somebody no longer on the crew is ignored", () => {
    expect(effectiveLeader({ leadId: 't', today: { userId: 'gone', until: ms('23:59') }, now, onClock: new Set(['t', 'gone']), joinedInOrder: [], crewInOrder: ['t', 'p'] }).userId).toBe('t');
  });
  it('nobody on the clock: stays with the named leader', () => {
    expect(effectiveLeader({ leadId: 't', now, onClock: new Set(), joinedInOrder: ['p'] })).toEqual({ userId: 't', acting: false, source: 'LEAD' });
  });
});

describe('mayMoveStep', () => {
  const leader = { userId: 't', acting: false, source: 'LEAD' as const };
  it('without crew mode anybody on the crew moves it, as before', () => {
    expect(mayMoveStep({ actorId: 'p', isOffice: false, onCrew: true, crewMode: false, leader })).toEqual({ ok: true });
  });
  it('with crew mode only the leader', () => {
    expect(mayMoveStep({ actorId: 'p', isOffice: false, onCrew: true, crewMode: true, leader })).toEqual({ ok: false, code: CREW_CODES.LEADER_MOVES_STEPS });
    expect(mayMoveStep({ actorId: 't', isOffice: false, onCrew: true, crewMode: true, leader })).toEqual({ ok: true });
  });
  it('the office always; a stranger never', () => {
    expect(mayMoveStep({ actorId: 'x', isOffice: true, onCrew: false, crewMode: true, leader })).toEqual({ ok: true });
    expect(mayMoveStep({ actorId: 'x', isOffice: false, onCrew: false, crewMode: false, leader })).toEqual({ ok: false, code: CREW_CODES.NOT_ON_CREW });
  });
});

describe('pausesAtClockOut', () => {
  it('only the last joined member on the clock pauses it', () => {
    expect(pausesAtClockOut({ leaverId: 't', joined: ['t', 'p'], onClock: new Set(['p']) })).toBe(false);
    // Conor is on the clock but never joined: the job does not keep running for nobody.
    expect(pausesAtClockOut({ leaverId: 'p', joined: ['p'], onClock: new Set(['c']) })).toBe(true);
  });
});

describe('jobTimeAt — a crew total runs once per person counting', () => {
  it('adds a minute per counting person', () => {
    const reading = {
      asOf: T('10:00').toISOString(),
      total: { travel: 0, working: 120, blocked: 0 },
      byWorker: [
        { user: { id: 'a' }, travel: 0, working: 60, blocked: 0, live: 'working' as const },
        { user: { id: 'b' }, travel: 0, working: 60, blocked: 0, live: 'blocked' as const },
      ],
      live: { kind: 'working' as const },
    };
    expect(jobTimeAt(reading, null, ms('10:10'))).toMatchObject({ working: 130, blocked: 10 });
    expect(jobTimeAt(reading, 'b', ms('10:10'))).toMatchObject({ working: 60, blocked: 10, live: 'blocked' });
  });
});

describe('endOfLocalDay', () => {
  it('is the last millisecond of the day where the work is', () => {
    const end = endOfLocalDay(new Date('2026-10-01T15:00:00Z'), 'America/Los_Angeles');
    expect(end.toISOString()).toBe('2026-10-02T06:59:59.999Z');
  });

  it('a 25-hour day (clocks back) still ends at midnight', () => {
    // Vienna, Sunday 25 October 2026: CEST → CET at 03:00. Midnight that night is 23:00Z.
    expect(endOfLocalDay(new Date('2026-10-25T10:00:00Z'), 'Europe/Vienna').toISOString()).toBe('2026-10-25T22:59:59.999Z');
  });

  it('a 23-hour day (clocks forward) still ends at midnight', () => {
    // Vienna, Sunday 29 March 2026: CET → CEST. Midnight that night is 22:00Z.
    expect(endOfLocalDay(new Date('2026-03-29T10:00:00Z'), 'Europe/Vienna').toISOString()).toBe('2026-03-29T21:59:59.999Z');
  });
});
