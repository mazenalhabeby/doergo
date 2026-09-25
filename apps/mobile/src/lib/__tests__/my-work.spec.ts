import fs from 'fs';
import path from 'path';
import {
  shapeFor, faceFor, viewAllSpaceIds, weekOf, tasksOn, hasHour, decisionFor, routeFor,
  stepsFor, shiftOn, shiftHours, nextJobAfter, figuresFor,
} from '../../components/home/my-work';
import type { ScheduleEntry, Task } from '../api/types';

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

  it('⚠️ the schedule is 0 = MONDAY — a bar on the wrong day is one day late', () => {
    const s: ScheduleEntry[] = [{ id: '1', dayOfWeek: 0, startTime: '07:00', endTime: '15:00', isActive: true }];
    expect(shiftOn(s, new Date(2026, 8, 21))).not.toBeNull(); // Monday
    expect(shiftOn(s, new Date(2026, 8, 27))).toBeNull(); // Sunday
    expect(shiftHours(s[0]!)).toBe(8);
  });

  it('the second line of "nothing scheduled" is the next open job', () => {
    const list = [task({ id: 'x', dueDate: at(2026, 9, 27, 8) })];
    expect(nextJobAfter(list, new Date(2026, 8, 25), () => true)?.id).toBe('x');
    expect(nextJobAfter(list, new Date(2026, 8, 27), () => true)).toBeNull();
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

describe('my-work — no new endpoint, one outbox', () => {
  const card = code('components/home/my-work-card.tsx');
  it('reads jobs through useHomeTasks and never tasksApi.list', () => {
    expect(card).toMatch(/useHomeTasks\(\)/);
    expect(card).not.toMatch(/tasksApi\.list\(/);
  });
  it('the verb goes through the same outbox action and GPS fix as the task screen', () => {
    expect(card).toMatch(/changeTaskStatus\(offline\.engine/);
    expect(card).toMatch(/takeStatusFix\(to\.key\)/);
    expect(code('../app/(app)/task/[id].tsx')).toMatch(/takeStatusFix\(newStatus\)/);
  });
  it('shift bars come from the member\'s own schedule, not the supervisor availability board', () => {
    expect(card).toMatch(/scheduleApi\.getMine\(/);
    expect(card).not.toMatch(/availabilityApi/);
  });
});
