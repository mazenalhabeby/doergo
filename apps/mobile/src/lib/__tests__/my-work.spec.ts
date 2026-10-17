import fs from 'fs';
import path from 'path';
import {
  shapeFor, faceFor, viewAllSpaceIds, weekOf, tasksOn, hasHour,
  stepsFor, shiftOn, shiftHours, nextJobAfter, figuresFor, todaysOwn,
} from '../../components/home/my-work';
import type { ScheduleEntry, Task } from '../api/types';
import { readSource } from '../../test-utils/read-source';

const SRC = path.resolve(__dirname, '../..');
const code = (p: string) => readSource(path.join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

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

describe('my-work — one button: open the job', () => {
  const card = code('components/home/my-work-card.tsx');
  it('the focused job carries ONE button, and it opens the job page', () => {
    expect(card).toMatch(/const openTask = useCallback\(\(task: Task\) => router\.push\(`\/task\/\$\{task\.id\}`/);
    expect(card).toMatch(/onOpen=\{\(\) => openTask\(task\)\}/);
    expect(card).not.toMatch(/JobSheet|useJobActions|VerbButton|changeTaskStatus/);
  });
  it('⚠️ 10.png: tapping one of your rows focuses it in place; anything else opens the job', () => {
    expect(card).toMatch(/isMine\(task, user\?\.id\) && open\(task\) \? setFocusId\(task\.id\) : openTask\(task\)/);
    expect(card).toMatch(/task === active \? \(/);
    expect(card).not.toMatch(/layout=\{|entering=\{/);
  });
});

describe('my-work — no new endpoint, one outbox', () => {
  const card = code('components/home/my-work-card.tsx');
  it('reads jobs through useHomeTasks and never tasksApi.list', () => {
    expect(card).toMatch(/useHomeTasks\(\)/);
    expect(card).not.toMatch(/tasksApi\.list\(/);
  });
  it('the task screen takes its GPS fix through the one shared helper', () => {
    expect(code('../app/(app)/task/[id].tsx')).toMatch(/takeStatusFix\(newStatus\)/);
  });
  it('shift bars come from the member\'s own schedule, not the supervisor availability board', () => {
    expect(card).toMatch(/scheduleApi\.getMine\(/);
    expect(card).not.toMatch(/availabilityApi/);
  });
});
