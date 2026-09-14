jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n) }));

import { mergeComments, overlayTask, pendingComments } from '../tasks/overlay';
import { filterTasksLocally } from '../tasks/task-list-query';
import type { OutboxOp } from '../outbox/types';

const op = (over: Partial<OutboxOp>): OutboxOp => ({
  id: 'op1', userId: 'u1', organizationId: 'o1', op: 'task.status', lane: 'task:t1', entityId: 't1',
  dependsOn: [], payload: { params: { taskId: 't1' }, body: {} }, state: 'pending', attempts: 0, createdAt: 1_757_849_000_000, updatedAt: 0,
  ...over,
});

describe('overlayTask', () => {
  const task = { id: 't1', status: 'EN_ROUTE' };

  it('shows the newest unsent status change', () => {
    const ops = [op({ id: 'a', payload: { body: { status: 'ARRIVED' } } }), op({ id: 'b', payload: { body: { status: 'IN_PROGRESS' } } })];
    expect(overlayTask(task, ops)).toEqual({ id: 't1', status: 'IN_PROGRESS', pendingSync: true });
  });

  it('drops a change the moment it is refused, and ignores sent ones', () => {
    for (const state of ['failed', 'conflict', 'done', 'discarded'] as const) {
      expect(overlayTask(task, [op({ state, payload: { body: { status: 'ARRIVED' } } })])).toEqual({ ...task, pendingSync: false });
    }
  });

  it('takes a job handed back offline out of my list at the tap', () => {
    const mine = { id: 't1', status: 'ASSIGNED', assignedToId: 'u1' };
    const shown = overlayTask(mine, [op({ op: 'task.decline', payload: { params: { taskId: 't1' } } })]);
    expect(shown).toMatchObject({ status: 'NEW', assignedToId: null, pendingSync: true });
    expect(filterTasksLocally([{ ...shown, title: 'x' }], { assignedToMe: true } as any, 'u1')).toEqual([]);
  });

  it('ignores other tasks', () => {
    expect(overlayTask(task, [op({ entityId: 't2', payload: { body: { status: 'ARRIVED' } } })]).status).toBe('EN_ROUTE');
  });
});

describe('comments', () => {
  const me = { id: 'u1', firstName: 'Mike', lastName: 'Weber' };

  it('renders an unsent note as pending, and once when the server has it', () => {
    const pending = pendingComments('t1', [op({ op: 'task.comment', payload: { body: { id: 'c-new', content: 'Pump replaced' } } })], me);
    expect(pending[0]).toMatchObject({ id: 'c-new', content: 'Pump replaced', pendingSync: true, user: { firstName: 'Mike' } });
    const server = [{ id: 'c-old', createdAt: '2026-09-01T08:00:00Z' }, { id: 'c-new', createdAt: '2026-09-14T09:00:00Z' }];
    expect(mergeComments(server, pending).map((c) => c.id)).toEqual(['c-old', 'c-new']);
  });
});

describe('filterTasksLocally', () => {
  const rows = [
    { id: 'in-window', title: 'Boiler', status: 'ASSIGNED', dueDate: '2026-09-10T09:00:00Z', assignedToId: 'u1' },
    { id: 'undated', title: 'Leak', status: 'NEW', dueDate: null, assignedToId: 'u2', assignees: [{ userId: 'u1' }] },
    { id: 'overdue-active', title: 'Pump', status: 'IN_PROGRESS', dueDate: '2026-08-20T09:00:00Z', assignedToId: 'u1' },
    { id: 'overdue-done', title: 'Valve', status: 'COMPLETED', dueDate: '2026-08-20T09:00:00Z', assignedToId: 'u1' },
    { id: 'next-month', title: 'Filter', status: 'ASSIGNED', dueDate: '2026-10-02T09:00:00Z', assignedToId: 'u3', description: 'Replace the pump filter' },
  ];
  const current = { startDate: '2026-09-01', endDate: '2026-09-30', includeNoDueDate: true };

  it('matches the server "current" tab: window, undated, overdue-but-active', () => {
    expect(filterTasksLocally(rows, current, 'u1').map((r) => r.id)).toEqual(['in-window', 'undated', 'overdue-active']);
  });

  it('matches the "upcoming" and "history" tabs', () => {
    expect(filterTasksLocally(rows, { startDate: '2026-10-01' }, 'u1').map((r) => r.id)).toEqual(['next-month']);
    expect(filterTasksLocally(rows, { endDate: '2026-08-31' }, 'u1').map((r) => r.id)).toEqual(['overdue-active', 'overdue-done']);
  });

  it('narrows to my work by lead OR co-assignee', () => {
    expect(filterTasksLocally(rows, { ...current, assignedToMe: true }, 'u1').map((r) => r.id)).toEqual(['in-window', 'undated', 'overdue-active']);
    expect(filterTasksLocally(rows, { assignedToMe: true }, 'u3').map((r) => r.id)).toEqual(['next-month']);
  });

  it('searches title and description, ignoring case', () => {
    expect(filterTasksLocally(rows, { search: 'PUMP' }, 'u1').map((r) => r.id)).toEqual(['overdue-active', 'next-month']);
  });

  it('uses UTC day boundaries like the server', () => {
    const edge = [{ id: 'edge', title: 'x', status: 'NEW', dueDate: '2026-09-30T23:30:00Z' }];
    expect(filterTasksLocally(edge, { startDate: '2026-09-01', endDate: '2026-09-30' }, 'u1')).toHaveLength(1);
    expect(filterTasksLocally([{ ...edge[0], dueDate: '2026-10-01T00:30:00Z' }], { startDate: '2026-09-01', endDate: '2026-09-30' }, 'u1')).toHaveLength(0);
  });
});
