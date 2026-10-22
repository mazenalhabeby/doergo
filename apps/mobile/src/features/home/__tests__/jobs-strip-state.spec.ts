import { jobsStripItems, jobsStripLines } from '../jobs-strip-state';

const job = (id: string, title = id) => ({ id, title, status: 'IN_PROGRESS', pausedAt: '2026-10-01T15:00:00Z', pausedById: 'me', locationAddress: null, customer: null });

describe('the home jobs strip', () => {
  it('a note owed is asked for whether or not the member is clocked in', () => {
    expect(jobsStripItems({ owed: [job('a')], paused: [] }, false)).toEqual([{ kind: 'owed', taskId: 'a', title: 'a' }]);
  });

  it('a paused job is offered back only once clocked in again', () => {
    expect(jobsStripItems({ owed: [], paused: [job('b')] }, false)).toEqual([]);
    expect(jobsStripItems({ owed: [], paused: [job('b')] }, true)).toEqual([{ kind: 'paused', taskId: 'b', title: 'b' }]);
  });

  it('notes come first, and a job both owed and paused is listed once', () => {
    const items = jobsStripItems({ owed: [job('a')], paused: [job('a'), job('c')] }, true);
    expect(items.map((i) => `${i.kind}:${i.taskId}`)).toEqual(['owed:a', 'paused:c']);
  });

  it('names the first and counts the rest', () => {
    expect(jobsStripLines([])).toBeNull();
    const one = jobsStripLines([{ kind: 'owed', taskId: 'a', title: 'Boiler' }])!;
    expect(one.title).toEqual({ k: 'jobsStrip.owedTitle', v: { title: 'Boiler' } });
    expect(one.sub.k).toBe('jobsStrip.owedSub');
    const two = jobsStripLines([{ kind: 'paused', taskId: 'a', title: 'Boiler' }, { kind: 'paused', taskId: 'b', title: 'Pump' }])!;
    expect(two.title.k).toBe('jobsStrip.pausedTitle');
    expect(two.sub).toEqual({ k: 'jobsStrip.more', v: { count: 1 } });
  });
});

describe('a paused job says how long it has taken so far', () => {
  it('the "so far" line carries my own minutes', () => {
    const items = jobsStripItems({ owed: [], paused: [{ ...job('b', 'Boiler'), workedMinutes: 135 }] }, true);
    expect(jobsStripLines(items)!.sub).toEqual({ k: 'jobsStrip.pausedSoFar', v: { minutes: 135 } });
  });
});
