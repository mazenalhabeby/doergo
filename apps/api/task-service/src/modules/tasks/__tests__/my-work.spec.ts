import { rankMyWork, summariseMyWork, workBand, type WorkItem } from '@hbcfield/shared';

/**
 * What should I work on next?
 *
 * A list of tasks assigned to somebody is not an answer to that question. Sorted
 * by creation date — which is what every list here did — the job two days
 * overdue sits below one due next month, and the job already half-done sits
 * wherever it happens to fall.
 *
 * This is the ordering, pinned. It is pure and shared so the phone and the web
 * cannot come to different opinions about which job is next.
 */

const NOW = new Date('2026-09-09T10:00:00Z');
const at = (iso: string) => new Date(iso);

const task = (over: Partial<WorkItem> & { id: string }): WorkItem => ({
  title: over.id,
  status: 'ASSIGNED',
  priority: 'MEDIUM',
  dueDate: null,
  ...over,
});

const order = (tasks: WorkItem[]) => rankMyWork(tasks, NOW).map((t) => t.id);

describe('which band a job is in', () => {
  it('calls a job you are standing in “doing”', () => {
    expect(workBand(task({ id: 'a', status: 'IN_PROGRESS' }), NOW)).toBe('doing');
    expect(workBand(task({ id: 'b', status: 'EN_ROUTE' }), NOW)).toBe('doing');
    // A custom workflow's own name for it counts too.
    expect(workBand(task({ id: 'c', status: 'WORKING' }), NOW)).toBe('doing');
  });

  /*
    Midday instants on purpose. "Due" is a fact about somebody's LOCAL day, and
    23:00Z on the 8th is already the 9th in Vienna — an edge worth respecting in
    the rule and worth keeping out of a fixture, where it only tests the runner's
    timezone.
  */
  it('separates overdue from due today from later', () => {
    expect(workBand(task({ id: 'a', dueDate: at('2026-09-07T12:00:00Z') }), NOW)).toBe('overdue');
    expect(workBand(task({ id: 'b', dueDate: at('2026-09-09T12:00:00Z') }), NOW)).toBe('today');
    expect(workBand(task({ id: 'c', dueDate: at('2026-09-11T12:00:00Z') }), NOW)).toBe('upcoming');
  });

  it('reads the due date in the local day, not in UTC', () => {
    // The same instant is "today" or "yesterday" depending on where you are —
    // the rule follows the person, which is why `dayKey` is local.
    const lateOnTheEighth = at('2026-09-08T23:00:00Z');
    const band = workBand(task({ id: 'a', dueDate: lateOnTheEighth }), NOW);
    expect(['overdue', 'today']).toContain(band);
  });

  /*
    A status under way outranks its date. A job you are in the middle of is not
    "upcoming" because its due date is next week — you are doing it now.
  */
  it('lets being under way beat any date', () => {
    expect(workBand(task({ id: 'a', status: 'IN_PROGRESS', dueDate: at('2026-12-01') }), NOW)).toBe('doing');
  });

  it('treats an undated job as upcoming, not urgent', () => {
    expect(workBand(task({ id: 'a' }), NOW)).toBe('upcoming');
  });
});

describe('the order somebody actually works in', () => {
  /*
    The headline: finishing beats starting. You are standing in somebody's
    kitchen — nothing on the list is more urgent than the thing in your hands.
  */
  it('puts the job already under way first, ahead of an overdue one', () => {
    expect(order([
      task({ id: 'overdue', dueDate: at('2026-09-01') }),
      task({ id: 'doing', status: 'IN_PROGRESS', dueDate: at('2026-12-01') }),
    ])).toEqual(['doing', 'overdue']);
  });

  it('puts a blocked job above anything not started', () => {
    expect(order([
      task({ id: 'today', dueDate: at('2026-09-09T15:00:00Z') }),
      task({ id: 'blocked', status: 'BLOCKED' }),
    ])).toEqual(['blocked', 'today']);
  });

  it('runs overdue, then today, then later', () => {
    expect(order([
      task({ id: 'later', dueDate: at('2026-09-20') }),
      task({ id: 'today', dueDate: at('2026-09-09T16:00:00Z') }),
      task({ id: 'overdue', dueDate: at('2026-09-05') }),
    ])).toEqual(['overdue', 'today', 'later']);
  });

  it('breaks a tie on urgency', () => {
    expect(order([
      task({ id: 'low', priority: 'LOW', dueDate: at('2026-09-09T09:00:00Z') }),
      task({ id: 'urgent', priority: 'URGENT', dueDate: at('2026-09-09T09:00:00Z') }),
    ])).toEqual(['urgent', 'low']);
  });

  it('puts dated work ahead of undated work of the same urgency', () => {
    expect(order([
      task({ id: 'someday' }),
      task({ id: 'friday', dueDate: at('2026-09-25') }),
    ])).toEqual(['friday', 'someday']);
  });

  /*
    Finished work SINKS rather than disappearing. A list that silently removes
    what you just completed leaves somebody wondering whether it saved.
  */
  it('sinks finished work without dropping it', () => {
    const out = order([
      task({ id: 'done', status: 'COMPLETED', dueDate: at('2026-09-01') }),
      task({ id: 'open', dueDate: at('2026-09-20') }),
    ]);
    expect(out).toEqual(['open', 'done']);
    expect(out).toHaveLength(2);
  });

  it('is stable, so the list does not reshuffle between refreshes', () => {
    const items = [task({ id: 'b', title: 'B' }), task({ id: 'a', title: 'A' })];
    expect(order(items)).toEqual(order([...items].reverse()));
  });

  it('does not mutate what it was given', () => {
    const items = [task({ id: 'b' }), task({ id: 'a', status: 'IN_PROGRESS' })];
    rankMyWork(items, NOW);
    expect(items.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('the one-line summary of somebody’s day', () => {
  const day = [
    task({ id: 'doing', status: 'IN_PROGRESS' }),
    task({ id: 'blocked', status: 'BLOCKED' }),
    task({ id: 'late', dueDate: at('2026-09-02') }),
    task({ id: 'today', dueDate: at('2026-09-09T14:00:00Z') }),
    task({ id: 'later', dueDate: at('2026-10-01') }),
    task({ id: 'done', status: 'COMPLETED' }),
  ];

  it('counts only what is still outstanding', () => {
    const s = summariseMyWork(day, NOW);
    expect(s.total).toBe(5); // the completed one is not somebody's workload
    expect(s).toMatchObject({ doing: 1, blocked: 1, overdue: 1, today: 1 });
  });

  it('names the one to open', () => {
    expect(summariseMyWork(day, NOW).next?.id).toBe('doing');
  });

  it('says so plainly when there is nothing to do', () => {
    const s = summariseMyWork([task({ id: 'done', status: 'CLOSED' })], NOW);
    expect(s.total).toBe(0);
    expect(s.next).toBeNull();
  });
});
