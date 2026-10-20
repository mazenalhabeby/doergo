/**
 * Job time: travel, working and blocked, counted only inside a shift, per person.
 * The rule: packages/shared/src/tasks/job-time.ts.
 */
import { clockMinutes, exclusiveSpans, jobSpans, jobWindows, joinedJobAt, shiftsWithoutRests, stepTimeKind, workerJobTime, type WorkTimelineEvent } from '@hbcfield/shared';

const T = (hhmm: string) => new Date(`2026-09-29T${hhmm}:00Z`);
const kindOf = (s: string) => stepTimeKind(s, s === 'EN_ROUTE' ? ['gps', 'timer'] : s === 'BLOCKED' ? ['timer'] : s === 'ACCEPTED' ? ['timer'] : ['timer']);
const ev = (at: string, userId: string, kind: WorkTimelineEvent['kind'], status?: string, forUserId?: string): WorkTimelineEvent =>
  ({ at: T(at), userId, kind, status, forUserId });

describe('stepTimeKind — from the step, never its name', () => {
  it('on the way is travel; on site is working; reporting an issue is blocked; taking it on is nothing', () => {
    expect(stepTimeKind('EN_ROUTE', ['gps', 'timer'])).toBe('travel');
    expect(stepTimeKind('IN_TRANSIT', ['gps', 'timer'])).toBe('travel');
    expect(stepTimeKind('IN_PROGRESS', ['timer'])).toBe('working');
    // A sales visit tracks the route AND asks a form: it is work on site, not travel.
    expect(stepTimeKind('VISITED', ['gps', 'timer', 'form'])).toBe('working');
    expect(stepTimeKind('BLOCKED', ['timer'])).toBe('blocked');
    expect(stepTimeKind('ACCEPTED', ['timer'])).toBeNull();
    expect(stepTimeKind('COMPLETED', ['report'])).toBeNull();
  });
});

describe('one job, Tuesday (the mockup)', () => {
  const events = [
    ev('13:08', 'mike', 'STATUS', 'EN_ROUTE'),
    ev('13:30', 'mike', 'STATUS', 'IN_PROGRESS'),
    ev('15:15', 'mike', 'STATUS', 'BLOCKED'),
    ev('15:25', 'mike', 'STATUS', 'IN_PROGRESS'),
    ev('17:00', 'mike', 'PAUSED'),
  ];
  const spans = jobSpans(events, T('20:00'), kindOf);

  it('splits it three ways and stops at the clock-out', () => {
    const shifts = [{ start: T('07:00'), end: T('17:00') }];
    expect(workerJobTime(spans, joinedJobAt(events, 'mike'), shifts)).toEqual({ travel: 22, working: 105 + 95, blocked: 10 });
  });

  it('never counts time off the clock — a shift ending at 16:00 ends the job time with it', () => {
    const shifts = [{ start: T('07:00'), end: T('16:00') }];
    expect(workerJobTime(spans, joinedJobAt(events, 'mike'), shifts).working).toBe(105 + 35);
  });

  it('a report window clips it', () => {
    const shifts = [{ start: T('07:00'), end: T('17:00') }];
    expect(workerJobTime(spans, joinedJobAt(events, 'mike'), shifts, { from: T('15:00'), to: T('16:00') })).toEqual({ travel: 0, working: 15 + 35, blocked: 10 });
  });
});

describe('who is credited', () => {
  it('the office starting it FOR Mike credits Mike, not the office', () => {
    const events = [ev('09:00', 'anna', 'STATUS', 'IN_PROGRESS', 'mike')];
    const spans = jobSpans(events, T('10:00'), kindOf);
    const shift = [{ start: T('08:00'), end: null }];
    expect(workerJobTime(spans, joinedJobAt(events, 'mike'), shift).working).toBe(60);
    expect(joinedJobAt(events, 'anna')).toBeNull();
  });

  it('whoever takes a job over starts at their own move; the time before stays the first worker\'s', () => {
    const events = [ev('08:00', 'mike', 'STATUS', 'IN_PROGRESS'), ev('10:00', 'mike', 'PAUSED'), ev('12:00', 'sarah', 'RESUMED')];
    const spans = jobSpans(events, T('13:00'), kindOf);
    const allDay = [{ start: T('07:00'), end: null }];
    expect(workerJobTime(spans, joinedJobAt(events, 'mike'), allDay).working).toBe(120 + 60);
    expect(workerJobTime(spans, joinedJobAt(events, 'sarah'), allDay).working).toBe(60);
  });
});

describe('rests are not job time', () => {
  it('a rest in the middle of a job is cut out of it, and out of the clock it is set against', () => {
    const shifts = shiftsWithoutRests([{ start: T('08:00'), end: T('12:00'), rests: [{ start: T('10:00'), end: T('10:30') }] }], T('20:00'));
    const events = [ev('08:00', 'mike', 'STATUS', 'IN_PROGRESS')];
    expect(workerJobTime(jobSpans(events, T('12:00'), kindOf), joinedJobAt(events, 'mike'), shifts).working).toBe(210);
    expect(clockMinutes(shifts, T('00:00'), T('23:59'))).toBe(210);
  });
});

describe('one person, one job at a time', () => {
  it('two jobs left in progress at once never add up to more than the shift', () => {
    const a = [ev('08:00', 'mike', 'STATUS', 'IN_PROGRESS')];
    const b = [ev('10:00', 'mike', 'STATUS', 'IN_PROGRESS')];
    const until = T('12:00');
    const mine = exclusiveSpans([
      { id: 'a', spans: jobSpans(a, until, kindOf), joinedAt: joinedJobAt(a, 'mike') },
      { id: 'b', spans: jobSpans(b, until, kindOf), joinedAt: joinedJobAt(b, 'mike') },
    ]);
    const shift = [{ start: T('07:00'), end: null }];
    const ta = workerJobTime(mine.get('a')!, -Infinity, shift);
    const tb = workerJobTime(mine.get('b')!, -Infinity, shift);
    // The job moved most recently takes the overlap: 08–10 on A, 10–12 on B.
    expect([ta.working, tb.working]).toEqual([120, 120]);
  });
});

describe('handed away', () => {
  it('a worker taken off the job stops being credited at the hand-over, however long they stay clocked in', () => {
    const events: WorkTimelineEvent[] = [
      ev('08:00', 'mike', 'STATUS', 'IN_PROGRESS'),
      { at: T('10:00'), userId: 'mike', kind: 'LEFT' },
      ev('10:30', 'sarah', 'RESUMED'),
    ];
    const until = T('12:00');
    const spans = jobSpans(events, until, kindOf);
    const allDay = [{ start: T('07:00'), end: null }];
    const share = (who: string) => workerJobTime(exclusiveSpans([{ id: 'j', spans, windows: jobWindows(events, who) }]).get('j')!, -Infinity, allDay).working;
    expect(share('mike')).toBe(120);
    expect(share('sarah')).toBe(90);
  });
});
