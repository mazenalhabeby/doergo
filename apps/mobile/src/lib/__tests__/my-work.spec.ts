import fs from 'fs';
import path from 'path';
import {
  shapeFor, faceFor, viewAllSpaceIds, weekOf, tasksOn, hasHour, decisionFor, routeFor,
  stepsFor, shiftOn, shiftHours, nextJobAfter, figuresFor, todaysOwn,
} from '../../components/home/my-work';
import type { ScheduleEntry, Task } from '../api/types';
import { verbKind, timerStart, railOf, declineTarget, toneOf } from '../../components/job/job-flow';

const SRC = path.resolve(__dirname, '../..');
const code = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const task = (over: Record<string, unknown>): Task => ({
  id: 't', title: 'Job', status: 'ASSIGNED', priority: 'MEDIUM', organizationId: 'o', createdById: 'x',
  createdAt: '', updatedAt: '', assignedToId: 'me', assignees: [], ...over,
} as unknown as Task);

describe('my-work — the two axes', () => {
  it('modules decide the shape; a clock-only member gets shifts, neither gets nothing', () => {
    expect(shapeFor({ tasks: true, clock: true })).toBe('both');
    expect(shapeFor({ tasks: true, clock: false })).toBe('tasks');
    expect(shapeFor({ tasks: false, clock: true })).toBe('shifts');
    expect(shapeFor({ tasks: false, clock: false })).toBe('none');
  });

  it('grants decide the content — and a SPACE grant is path 4, not "executor"', () => {
    expect(faceFor({ role: 'ADMIN' })).toBe('orgWide');
    expect(faceFor({ canViewAllTasks: true })).toBe('orgWide');
    expect(faceFor({ viewAllSpaceIds: viewAllSpaceIds({ s1: { canViewAllTasks: true }, s2: {} }) })).toBe('spaceSupervisor');
    expect(faceFor({})).toBe('executor');
  });
});

describe('my-work — the week', () => {
  it('Monday first, seven days, and a day holds its own jobs in order', () => {
    const w = weekOf(new Date(2026, 8, 25)); // a Friday
    expect(w).toHaveLength(7);
    expect(w[0]!.getDay()).toBe(1);
    const list = [task({ id: 'b', dueDate: at(2026, 9, 25, 13) }), task({ id: 'a', dueDate: at(2026, 9, 25, 9, 30) }), task({ id: 'c', dueDate: at(2026, 9, 26, 9) })];
    expect(tasksOn(list, new Date(2026, 8, 25)).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('⚠️ a due date at midnight carries no hour', () => {
    expect(hasHour(at(2026, 9, 25))).toBe(false);
    expect(hasHour(at(2026, 9, 25, 9, 30))).toBe(true);
  });

  it('⚠️ the schedule is 0 = SUNDAY, like the server — a bar on the wrong day is one day late', () => {
    const s: ScheduleEntry[] = [{ id: '1', dayOfWeek: 1, startTime: '07:00', endTime: '15:00', isActive: true }];
    expect(shiftOn(s, new Date(2026, 8, 21))).not.toBeNull(); // Monday
    expect(shiftOn(s, new Date(2026, 8, 22))).toBeNull(); // Tuesday
    expect(shiftHours(s[0]!)).toBe(8);
  });

  it('the second line of "nothing scheduled" is the next open job', () => {
    const list = [task({ id: 'x', dueDate: at(2026, 9, 27, 8) })];
    expect(nextJobAfter(list, new Date(2026, 8, 25), () => true)?.id).toBe('x');
    expect(nextJobAfter(list, new Date(2026, 8, 27), () => true)).toBeNull();
  });
});

describe('my-work — today carries what is already in your hands', () => {
  it('⚠️ 01.png: a job you are on stays on Today whatever its date — and leads', () => {
    const now = new Date(2026, 8, 25, 20, 0);
    const list = [
      task({ id: 'today', dueDate: at(2026, 9, 25, 13), status: 'ASSIGNED' }),
      task({ id: 'onTheWay', dueDate: at(2026, 9, 9), status: 'EN_ROUTE' }),
      task({ id: 'overdue', dueDate: at(2026, 9, 20, 9), status: 'ASSIGNED' }),
      task({ id: 'doneLate', dueDate: at(2026, 9, 10), status: 'COMPLETED' }),
      task({ id: 'future', dueDate: at(2026, 9, 28, 9), status: 'ASSIGNED' }),
    ];
    const ids = todaysOwn(list, new Date(2026, 8, 25), (t) => t.status !== 'COMPLETED', now).map((t) => t.id);
    expect(ids[0]).toBe('onTheWay');
    expect(ids).toEqual(expect.arrayContaining(['today', 'overdue']));
    expect(ids).not.toContain('doneLate');
    expect(ids).not.toContain('future');
  });
});

describe('my-work — the decision', () => {
  const noFlows = new Map<string, unknown>();

  it('the verb is the next transition by position, the rest behind the ⋯, cancel never offered', () => {
    const d = decisionFor(task({ status: 'ASSIGNED' }), 'me', stepsFor(task({}), noFlows));
    expect(d?.primary.key).toBe('ACCEPTED');
    expect(d?.rest.map((s) => s.key)).not.toContain('CANCELED');
    const w = decisionFor(task({ status: 'IN_PROGRESS' }), 'me', stepsFor(task({}), noFlows));
    expect(w?.primary.key).toBe('COMPLETED');
    expect(w?.rest.map((s) => s.key)).toContain('BLOCKED');
  });

  it('⚠️ no verb when the job is not yours', () => {
    expect(decisionFor(task({ assignedToId: 'someone' }), 'me', stepsFor(task({}), noFlows))).toBeNull();
  });

  it('⚠️ a workflow this phone does not hold gives NO steps — never the field-service guess', () => {
    const t = task({ workflowId: 'wf-unknown' });
    expect(stepsFor(t, noFlows)).toBeNull();
    expect(decisionFor(t, 'me', stepsFor(t, noFlows))).toBeNull();
  });

  it('the organisation\'s own labels are the verb', () => {
    const flows = new Map<string, unknown>([['wf', { name: 'office', statuses: [
      { key: 'ASSIGNED', label: 'Take it', position: 0, transitions: ['IN_PROGRESS'] },
      { key: 'IN_PROGRESS', label: 'Begin', position: 1, transitions: ['COMPLETED'] },
      { key: 'COMPLETED', label: 'Signed off', position: 2, isFinal: true, transitions: [] },
    ] }]]);
    const t = task({ workflowId: 'wf' });
    expect(decisionFor(t, 'me', stepsFor(t, flows))?.primary.label).toBe('Begin');
  });

  it('⚠️ BLOCKED and a report-collecting finish open the job — the task screen asks for them', () => {
    const steps = stepsFor(task({}), noFlows)!;
    const blocked = decisionFor(task({ status: 'IN_PROGRESS' }), 'me', steps)!.rest.find((s) => s.key === 'BLOCKED')!;
    const done = steps.find((s) => s.key === 'COMPLETED')!;
    const onWay = steps.find((s) => s.key === 'EN_ROUTE')!;
    expect(routeFor(task({}), blocked, noFlows)).toBe('open');
    expect(routeFor(task({}), done, noFlows)).toBe('open');
    expect(routeFor(task({}), onWay, noFlows)).toBe('send');
  });

  it('org-wide is three figures, not forty-seven rows', () => {
    const f = figuresFor([
      task({ id: '1', priority: 'URGENT', spaceId: 'a' }),
      task({ id: '2', assignedToId: null, spaceId: 'b' }),
      task({ id: '3', status: 'COMPLETED', spaceId: 'b' }),
    ], (t) => t.status !== 'COMPLETED');
    expect(f).toEqual({ open: 2, urgent: 1, unassigned: 1, sites: 2 });
  });
});

describe('the job — the step logic reads capabilities, never names', () => {
  const S = (key: string, caps: string[] = [], extra: Record<string, unknown> = {}) =>
    ({ key, label: key, color: '', position: 0, isFinal: false, isCanceled: false, transitions: [], capabilities: caps, ...extra }) as never;
  it('the verb is what the next step MEANS', () => {
    expect(verbKind(S('A'), S('ON_THE_ROAD', ['gps']))).toBe('drive');
    expect(verbKind(S('ON_THE_ROAD', ['gps']), S('ON_SITE'))).toBe('arrive');
    expect(verbKind(S('ON_SITE'), S('WORKING', ['timer']))).toBe('start');
    expect(verbKind(S('WORKING', ['timer']), S('DONE', [], { isFinal: true }))).toBe('finish');
    expect(verbKind(S('OPEN'), S('TRIAGING'))).toBe('next');
  });
  it('⚠️ the timer runs from the first timer step — never from creation', () => {
    const steps = [S('ASSIGNED'), S('EN_ROUTE', ['gps', 'timer']), S('ARRIVED', ['timer'])];
    const ev = (to: string, at: string) => ({ id: to, eventType: 'STATUS_CHANGED', createdAt: at, metadata: { newStatus: to, occurredAt: at } });
    const start = timerStart([ev('ASSIGNED', '2026-05-01T08:00:00Z'), ev('EN_ROUTE', '2026-09-25T18:53:00Z'), ev('ARRIVED', '2026-09-25T19:20:00Z')] as never, steps);
    expect(new Date(start!).toISOString()).toBe('2026-09-25T18:53:00.000Z');
    expect(timerStart([], steps)).toBeNull();
  });
  it('the rail drops the cancel step; Decline exists only where the workflow can cancel', () => {
    const cancel = S('CANCELED', [], { isCanceled: true, position: 9 });
    const a = S('ASSIGNED', [], { transitions: ['ACCEPTED', 'CANCELED'] });
    expect(railOf([a, cancel]).map((s: { key: string }) => s.key)).toEqual(['ASSIGNED']);
    expect(declineTarget([a, cancel], a)).toBe(cancel);
    expect(declineTarget([a], S('TODO', [], { transitions: ['DOING'] }))).toBeNull();
  });
  it('tone from meaning: jade, warn when late, critical only when blocked', () => {
    expect(toneOf('WORKING', 0)).toBe('accent');
    expect(toneOf('WORKING', 16)).toBe('warn');
    expect(toneOf('BLOCKED', 0)).toBe('critical');
  });
});

describe('the job — docs/design/job-step.html', () => {
  const card = code('components/home/my-work-card.tsx');
  const sheet = code('components/job/job-sheet.tsx');
  const flow = code('components/job/job-flow.ts');
  const acts = code('components/job/use-job-actions.ts');

  it('⚠️ 10.png: tapping one of your rows FOCUSES it in place; the sheet opens from the active row', () => {
    expect(card).toMatch(/<JobSheet/);
    expect(card).toMatch(/isMine\(task, user\?\.id\) && open\(task\) \? setFocusId\(task\.id\) : setSheetFor\(\{ task, view: 'job' \}\)/);
    expect(card).toMatch(/onMore=\{\(\) => setSheetFor\(\{ task, view: 'more' \}\)\}/);
    expect(card).toMatch(/onOpen=\{\(\) => setSheetFor\(\{ task, view: 'job' \}\)\}/);
    /* In place: the list is rendered in order, the focused one expanded where it sits. */
    expect(card).toMatch(/task === active \? \(/);
    /* ⚠️ No Reanimated layout animation on the home column. */
    expect(card).not.toMatch(/layout=\{|entering=\{/);
    expect(card).not.toMatch(/<BlurSheet/);
  });

  it('⚠️ one sheet, four views — never four modals handing over', () => {
    expect((sheet.match(/<BlurSheet/g) ?? []).length).toBe(2); // the real one, and the empty guard
    for (const v of ["'job'", "'more'", "'wrong'", "'finish'"]) expect(sheet).toMatch(new RegExp(`view === ${v}`));
  });

  it('⚠️ never a name: no step key is read for meaning outside the tone', () => {
    for (const k of ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'ACCEPTED', 'ASSIGNED']) {
      expect(flow).not.toMatch(new RegExp(`'${k}'`));
      expect(sheet).not.toMatch(new RegExp(`'${k}'`));
    }
    expect(acts).not.toMatch(/'EN_ROUTE'/);
  });

  it('⚠️ the card and the sheet move a job through the SAME actions', () => {
    expect(card).toMatch(/useJobActions\(/);
    expect(sheet).toMatch(/useJobActions\(/);
    expect(card).not.toMatch(/changeTaskStatus\(/);
    expect(acts).toMatch(/changeTaskStatus\(engine/);
  });

  it('finishing asks only for what the step names', () => {
    expect(sheet).toMatch(/const wantsSignature = has\(to, 'signature'\)/);
    expect(sheet).toMatch(/const wantsCustomer = wantsSignature && hasCustomer/);
    expect(acts).toMatch(/has\(to, 'report'\)/);
  });

  it('something is wrong: six reasons, files an issue, never moves the job', () => {
    expect(flow).toMatch(/WRONG_REASONS = \[/);
    expect(acts).toMatch(/reportIssueFromPhone\(/);
    const wrong = acts.slice(acts.indexOf('const reportWrong'));
    expect(wrong).not.toMatch(/changeTaskStatus/);
  });
});

describe('my-work — no new endpoint, one outbox', () => {
  const card = code('components/home/my-work-card.tsx');
  it('reads jobs through useHomeTasks and never tasksApi.list', () => {
    expect(card).toMatch(/useHomeTasks\(\)/);
    expect(card).not.toMatch(/tasksApi\.list\(/);
  });
  it('the verb goes through the same outbox action and GPS fix as the task screen', () => {
    expect(code('components/job/use-job-actions.ts')).toMatch(/changeTaskStatus\(engine/);
    expect(code('components/job/use-job-actions.ts')).toMatch(/takeStatusFix\(/);
    expect(code('../app/(app)/task/[id].tsx')).toMatch(/takeStatusFix\(newStatus\)/);
  });
  it('shift bars come from the member\'s own schedule, not the supervisor availability board', () => {
    expect(card).toMatch(/scheduleApi\.getMine\(/);
    expect(card).not.toMatch(/availabilityApi/);
  });
});
