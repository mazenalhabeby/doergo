import { jobTimeNow } from '../job-time-logic';

const view = (over: any = {}) => ({
  asOf: '2026-10-01T10:00:00Z',
  total: { travel: 30, working: 120, blocked: 10 },
  byWorker: [
    { user: { id: 'mike', firstName: 'Mike', lastName: 'W' }, travel: 20, working: 100, blocked: 10 },
    { user: { id: 'sarah', firstName: 'Sarah', lastName: 'W' }, travel: 10, working: 20, blocked: 0 },
  ],
  live: { kind: 'working', workers: 1 },
  startedBy: null,
  ...over,
});
const at = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00Z`).getTime();

describe('job time on screen', () => {
  it('a worker reads their own share, moved forward while it is live', () => {
    expect(jobTimeNow(view() as any, 'mike', at('10:05'))).toEqual({ travel: 20, working: 105, blocked: 10, live: 'working' });
  });

  it('the office reads the whole job', () => {
    expect(jobTimeNow(view() as any, null, at('10:00'))!.working).toBe(120);
  });

  it('nothing ticks when nobody is on the clock', () => {
    expect(jobTimeNow(view({ live: null }) as any, 'mike', at('12:00'))!.working).toBe(100);
  });

  it('somebody not on the job does not inherit its clock', () => {
    expect(jobTimeNow(view() as any, 'stranger', at('10:05'))).toEqual({ travel: 30, working: 120, blocked: 10, live: null });
  });
});
