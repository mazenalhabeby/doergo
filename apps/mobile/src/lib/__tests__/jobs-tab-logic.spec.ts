/**
 * The Jobs tab's rules — `docs/design/job-flow.html`, `renderJobs()`.
 * Pure: `src/features/jobs-list/jobs-logic.ts` decides, the screen draws.
 */
import { getFlowSteps } from '@hbcfield/shared/client';
import {
  bandOf, blockedCount, canCreateJobs, chipsFor, effectiveFilter, emptyKind, filtersFor, groupJobs, nobodyOn, passesFilter, periodParams,
  pickNextUp, placeOf, rowRight, rowWho, showsNextUp, showsRouteRow,
  type JobFacts,
} from '../../features/jobs-list/jobs-logic';
import { decideNext, parseOpenSheet } from '../../features/job/job-logic';
import { isClosed, isUnderWay, isCanceled, isMine, stepsFor } from '../../features/home/my-work';
import { filterTasksLocally } from '../../offline/tasks/task-list-query';
import type { Task } from '../api/types';

const NOW = new Date(2026, 8, 27, 10, 0, 0); // Sun 27 Sep 2026, 10:00 local
const at = (d: number, h = 0, m = 0) => new Date(2026, 8, d, h, m, 0).toISOString();
const ME = 'me';

let n = 0;
type Draft = Omit<Partial<Task>, 'status'> & { status: string };
function job(p: Draft): Task {
  n += 1;
  return { id: `t${n}`, title: `Job ${n}`, priority: 'MEDIUM', createdAt: at(1), assignedToId: ME, ...p } as Task;
}

/** The facts the screen derives, with the built-in flow (no workflow on the row). */
const noFlows = new Map<string, unknown>();
const factsOf = (t: Task): JobFacts => {
  const steps = stepsFor(t as never, noFlows);
  return { mine: isMine(t as never, ME), closed: isClosed(t as never, steps), canceled: isCanceled(t as never, steps), underWay: isUnderWay(t as never, steps) };
};
const band = (t: Task) => bandOf(t, factsOf(t), NOW);

describe('bands — Doing now, Blocked, Overdue, Today, Later, Done', () => {
  it('puts each job in its well', () => {
    expect(band(job({ status: 'EN_ROUTE', dueDate: at(9) }))).toBe('doing');
    expect(band(job({ status: 'IN_PROGRESS' }))).toBe('doing');
    expect(band(job({ status: 'BLOCKED', dueDate: at(26) }))).toBe('blocked');
    expect(band(job({ status: 'ASSIGNED', dueDate: at(22) }))).toBe('overdue');
    expect(band(job({ status: 'ASSIGNED', dueDate: at(27, 16, 15) }))).toBe('today');
    expect(band(job({ status: 'ASSIGNED', dueDate: at(30, 8) }))).toBe('later');
    expect(band(job({ status: 'ASSIGNED' }))).toBe('later');
    expect(band(job({ status: 'COMPLETED', dueDate: at(20) }))).toBe('done');
    expect(band(job({ status: 'CANCELED', dueDate: at(20) }))).toBe('done');
  });

  it('somebody ELSE under way is not what the reader is doing — it sits by its date', () => {
    expect(band(job({ status: 'EN_ROUTE', assignedToId: 'karim', dueDate: at(27, 10) }))).toBe('today');
    expect(band(job({ status: 'IN_PROGRESS', assignedToId: 'karim', dueDate: at(20) }))).toBe('overdue');
  });

  it('a custom workflow step under way counts as doing (read from the flow, not the built-in names)', () => {
    const flow = { id: 'f1', statuses: [
      { key: 'NEW', name: 'New', position: 0, transitions: ['IN_TRANSIT'] },
      { key: 'IN_TRANSIT', name: 'In transit', position: 1, transitions: ['DELIVERED'] },
      { key: 'DELIVERED', name: 'Delivered', position: 2, isFinal: true, transitions: [] },
    ] };
    const flows = new Map<string, unknown>([['f1', flow]]);
    const t = job({ status: 'IN_TRANSIT', dueDate: at(30) });
    (t as any).workflowId = 'f1';
    const steps = stepsFor(t as never, flows);
    const f = { mine: true, closed: isClosed(t as never, steps), canceled: false, underWay: isUnderWay(t as never, steps) };
    expect(bandOf(t, f, NOW)).toBe('doing');
  });

  it('groups in band order, drops empty wells, ranks inside a well by urgency', () => {
    const a = job({ status: 'ASSIGNED', dueDate: at(27, 9), priority: 'LOW', title: 'a' });
    const b = job({ status: 'ASSIGNED', dueDate: at(27, 12), priority: 'URGENT', title: 'b' });
    const c = job({ status: 'BLOCKED' });
    const d = job({ status: 'COMPLETED', dueDate: at(25) });
    const groups = groupJobs([d, a, c, b], factsOf, NOW);
    expect(groups.map((g) => g.band)).toEqual(['blocked', 'today', 'done']);
    expect(groups[1]!.items.map((x) => x.title)).toEqual(['b', 'a']);
  });
});

describe('filters per role', () => {
  it('each period offers only what can be true in it; Nobody on only when overseeing', () => {
    expect(filtersFor(false, 'current')).toEqual(['all', 'active', 'blocked', 'done', 'canceled']);
    expect(filtersFor(true, 'current')).toEqual(['all', 'nobody', 'active', 'blocked', 'done', 'canceled']);
    expect(filtersFor(false, 'upcoming')).toEqual(['all', 'notStarted', 'blocked']);
    expect(filtersFor(true, 'upcoming')).toEqual(['all', 'nobody', 'notStarted', 'blocked']);
    expect(filtersFor(true, 'history')).toEqual(['all', 'done', 'canceled']);
  });

  it('a chip with nothing behind it is not drawn, and every chip carries its count', () => {
    const later1 = job({ status: 'ASSIGNED', dueDate: at(30) });
    const later2 = job({ status: 'ASSIGNED', dueDate: at(31) });
    const chips = chipsFor([later1, later2], { oversee: false, period: 'upcoming' }, factsOf, NOW);
    // Nothing is blocked next week — no Blocked chip; both not started.
    expect(chips).toEqual([{ key: 'all', count: 2 }, { key: 'notStarted', count: 2 }]);
  });

  it('a chosen chip that empties hands back to All', () => {
    expect(effectiveFilter('blocked', [{ key: 'all', count: 3 }])).toBe('all');
    expect(effectiveFilter('blocked', [{ key: 'all', count: 3 }, { key: 'blocked', count: 1 }])).toBe('blocked');
  });

  it('done and cancelled are two different answers', () => {
    const done = job({ status: 'COMPLETED' });
    const off = job({ status: 'CANCELED' });
    const f = (t: typeof done) => ({ ...factsOf(t), canceled: t.status === 'CANCELED' });
    expect(passesFilter(done, 'done', band(done), f(done))).toBe(true);
    expect(passesFilter(off, 'done', band(off), f(off))).toBe(false);
    expect(passesFilter(off, 'canceled', band(off), f(off))).toBe(true);
  });

  it('each chip keeps what it names', () => {
    const doing = job({ status: 'IN_PROGRESS' });
    const later = job({ status: 'ASSIGNED', dueDate: at(30) });
    const blocked = job({ status: 'BLOCKED' });
    const done = job({ status: 'COMPLETED' });
    const free = job({ status: 'NEW', assignedToId: undefined, dueDate: at(27, 12) });
    const pass = (f: Parameters<typeof passesFilter>[1]) =>
      [doing, later, blocked, done, free].filter((t) => passesFilter(t, f, band(t), factsOf(t))).map((t) => t.id);
    expect(pass('all')).toHaveLength(5);
    expect(pass('active')).toEqual([doing.id, free.id]);
    expect(pass('blocked')).toEqual([blocked.id]);
    expect(pass('done')).toEqual([done.id]);
    expect(pass('nobody')).toEqual([free.id]);
    expect(blockedCount([doing, blocked, blocked])).toBe(2);
  });

  it('"nobody on" also reads the several-assignee list', () => {
    expect(nobodyOn({ assignedToId: undefined, assignees: [] } as never)).toBe(true);
    expect(nobodyOn({ assignedToId: undefined, assignees: [{ userId: 'x' }] } as never)).toBe(false);
  });
});

describe('Next up — the first own open job, with the real decision', () => {
  it('picks by band: my job on the way beats one due today and one overdue', () => {
    const today = job({ status: 'ASSIGNED', dueDate: at(27, 9) });
    const late = job({ status: 'ASSIGNED', dueDate: at(22) });
    const moving = job({ status: 'EN_ROUTE', dueDate: at(9) });
    expect(pickNextUp([today, late, moving], factsOf, NOW)?.id).toBe(moving.id);
    expect(pickNextUp([today, late], factsOf, NOW)?.id).toBe(late.id);
  });

  it('never somebody else\'s, never a finished one', () => {
    const theirs = job({ status: 'IN_PROGRESS', assignedToId: 'karim' });
    const done = job({ status: 'COMPLETED' });
    expect(pickNextUp([theirs, done], factsOf, NOW)).toBeNull();
  });

  it('its button is the job page\'s decision — ASSIGNED offers ACCEPTED, EN_ROUTE offers ARRIVED, BLOCKED resumes', () => {
    const steps = getFlowSteps(undefined);
    expect(decideNext('ASSIGNED', steps).primary).toBe('ACCEPTED');
    expect(decideNext('EN_ROUTE', steps).primary).toBe('ARRIVED');
    expect(decideNext('BLOCKED', steps)).toMatchObject({ resume: true });
  });

  it('is drawn only on the plain view of now', () => {
    expect(showsNextUp({ period: 'current', filter: 'all', search: '' })).toBe(true);
    expect(showsNextUp({ period: 'current', filter: 'all', search: 'valve' })).toBe(false);
    expect(showsNextUp({ period: 'current', filter: 'blocked', search: '' })).toBe(false);
    expect(showsNextUp({ period: 'history', filter: 'all', search: '' })).toBe(false);
  });

  it('a step that needs the page opens the job on that sheet — and only a sheet the page offers', () => {
    expect(parseOpenSheet('finish')).toBe('finish');
    expect(parseOpenSheet(['issue'])).toBe('issue');
    expect(parseOpenSheet('delete')).toBeNull();
    expect(parseOpenSheet(undefined)).toBeNull();
  });
});

describe('search — the data path, unchanged', () => {
  it('narrows the phone\'s copy by title and details', () => {
    const rows = [job({ status: 'ASSIGNED', title: 'Replace compressor valve' }), job({ status: 'ASSIGNED', title: 'Cable run', description: 'floor 2 valve box' }), job({ status: 'ASSIGNED', title: 'Leak' })];
    const hit = filterTasksLocally(rows as never[], { search: 'VALVE' }, ME);
    expect(hit.map((t: any) => t.title)).toEqual(['Replace compressor valve', 'Cable run']);
  });

  it('says what the empty well means', () => {
    expect(emptyKind({ search: 'x', filter: 'blocked', period: 'history' })).toBe('search');
    expect(emptyKind({ search: '', filter: 'blocked', period: 'current' })).toBe('blocked');
    expect(emptyKind({ search: '', filter: 'all', period: 'history' })).toBe('history');
    expect(emptyKind({ search: ' ', filter: 'all', period: 'current' })).toBe('none');
  });
});

describe('Plan my route — only to somebody who drives, with stops, on the plain view of now', () => {
  it('shows and hides', () => {
    const base = { drives: true, stops: 3, period: 'current' as const, filter: 'all' as const };
    expect(showsRouteRow(base)).toBe(true);
    expect(showsRouteRow({ ...base, drives: false })).toBe(false);
    expect(showsRouteRow({ ...base, stops: 0 })).toBe(false);
    expect(showsRouteRow({ ...base, period: 'upcoming' })).toBe(false);
    expect(showsRouteRow({ ...base, filter: 'active' })).toBe(false);
  });
});

describe('a row', () => {
  const open: JobFacts = { mine: true, closed: false, canceled: false, underWay: false };
  it('right side: waiting to send beats late beats done beats when', () => {
    expect(rowRight({ dueDate: at(20), pendingSync: true }, open, NOW)).toEqual({ kind: 'pending' });
    expect(rowRight({ dueDate: at(24) }, open, NOW)).toEqual({ kind: 'late', days: 3 });
    expect(rowRight({ dueDate: at(24) }, { ...open, closed: true }, NOW)).toEqual({ kind: 'done' });
    expect(rowRight({ dueDate: at(24) }, { ...open, closed: true, canceled: true }, NOW)).toEqual({ kind: 'none' });
    expect(rowRight({ dueDate: at(27, 16) }, open, NOW)).toEqual({ kind: 'due', at: at(27, 16) });
    expect(rowRight({}, open, NOW)).toEqual({ kind: 'none' });
  });

  it('who — only in Everyone, for somebody overseeing', () => {
    const t = { assignedToId: 'karim', assignedTo: { firstName: 'Karim' } };
    expect(rowWho(t, { ...open, mine: false }, { oversee: true, everyone: false })).toBeNull();
    expect(rowWho(t, { ...open, mine: false }, { oversee: false, everyone: true })).toBeNull();
    expect(rowWho(t, { ...open, mine: false }, { oversee: true, everyone: true })).toEqual({ kind: 'name', name: 'Karim' });
    expect(rowWho(t, open, { oversee: true, everyone: true })).toEqual({ kind: 'you' });
    expect(rowWho({ assignedToId: undefined }, { ...open, mine: false }, { oversee: true, everyone: true })).toEqual({ kind: 'nobody' });
  });

  it('place — the first part of the address, else the workspace', () => {
    expect(placeOf({ locationAddress: 'Industriezentrum NÖ-Süd, Wr. Neudorf' })).toBe('Industriezentrum NÖ-Süd');
    expect(placeOf({ locationAddress: undefined, space: { name: 'BILLA AG' } })).toBe('BILLA AG');
    expect(placeOf({})).toBeNull();
  });
});

describe('the rest of the screen', () => {
  it('periods ask for the member\'s own calendar days — this month, next month on, up to last month', () => {
    // ⚠️ Was `toISODateString(getStartOfMonth(now))`: local midnight on the 1st
    // read through UTC, so anywhere east of Greenwich "this month" started on
    // the last day of the previous one. The days asked for are local days.
    expect(periodParams('current', NOW)).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30', includeNoDueDate: true });
    expect(periodParams('upcoming', NOW)).toEqual({ startDate: '2026-10-01' });
    expect(periodParams('history', NOW)).toEqual({ endDate: '2026-08-31' });
  });

  it('the New job disc follows the tab bar\'s rule', () => {
    expect(canCreateJobs({ role: 'ADMIN' })).toBe(true);
    expect(canCreateJobs(null)).toBe(false);
  });
});
