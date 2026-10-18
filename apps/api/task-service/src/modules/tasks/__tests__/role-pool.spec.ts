import { rolePoolServices } from './role-pool.service.fixture';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ROLE_WAVE_CLOSED } from '../role-pool.service';

/*
  A task open to a WORK role — the server's rules that the e2e script cannot
  reach cheaply (packages/shared/src/tasks/role-pool.ts; role-pool.service.ts).
  The race itself is proved over real HTTP in tools/role-tasks-e2e.py.
*/

const OPEN_TASK = {
  id: 't1', title: 'Pump', status: 'NEW', spaceId: 's1', workflowId: null, createdById: 'boss', organizationId: 'org',
  openRoleId: 'mech', openSpotsLeft: 1, openSpots: 1, openedAt: new Date(), openRole: { name: 'Mechanic' },
};

function make(overrides: Record<string, any> = {}) {
  const prisma: any = {
    task: {
      findFirst: jest.fn().mockResolvedValue(OPEN_TASK),
      findUnique: jest.fn().mockResolvedValue(OPEN_TASK),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ openSpotsLeft: 0 }),
    },
    taskAssignee: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([{ user: { firstName: 'Ahmad', lastName: 'K' } }]),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    spaceAssignment: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    taskEvent: { create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Karim', lastName: 'A' }) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    ...overrides,
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const tasks: any = { assertCanReceiveTasks: jest.fn(), onAssigneesChanged: jest.fn(), assertMayAssignTask: jest.fn() };
  const notifications: any = { emit: jest.fn() };
  const svc = rolePoolServices(
    prisma,
    { expectedToday: jest.fn().mockResolvedValue(new Map()) } as any,
    notifications,
    tasks,
  );
  return { svc, prisma, tasks, notifications };
}

const holder = (extra: Record<string, any> = {}) => ({ user: { role: 'EMPLOYEE', enabledModules: { modules: ['tasks'] }, isExternal: false, ...extra } });

describe('role pool — taking', () => {
  it('somebody not holding the role gets a 404, and never the takers\' names', async () => {
    const { svc } = make({ task: { ...make().prisma.task, findFirst: jest.fn().mockResolvedValue({ ...OPEN_TASK, openSpotsLeft: 0 }) } });
    await expect(svc.take({ taskId: 't1', userId: 'u', organizationId: 'org' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a holder who was too slow is told ROLE_TASK_TAKEN, with who took it', async () => {
    const { svc, prisma } = make();
    prisma.spaceAssignment.findFirst.mockResolvedValue(holder());
    prisma.task.updateMany.mockResolvedValue({ count: 0 }); // the conditional claim lost
    const err = await svc.take({ taskId: 't1', userId: 'u', organizationId: 'org' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'ROLE_TASK_TAKEN', params: { takers: ['Ahmad K'] } });
    expect(prisma.taskAssignee.create).not.toHaveBeenCalled();
  });

  it('a holder whose profile has no Tasks, or an external member, is not a holder', async () => {
    const { svc, prisma } = make();
    prisma.spaceAssignment.findFirst.mockResolvedValue(holder({ isExternal: true }));
    expect(await svc.holdsOpenRole(OPEN_TASK, 'u')).toBe(false);
    prisma.spaceAssignment.findFirst.mockResolvedValue(holder({ enabledModules: { modules: ['clock'] } }));
    expect(await svc.holdsOpenRole(OPEN_TASK, 'u')).toBe(false);
    prisma.spaceAssignment.findFirst.mockResolvedValue(holder());
    expect(await svc.holdsOpenRole(OPEN_TASK, 'u')).toBe(true);
  });

  it('a take goes through the office\'s own assignment path, and the creator is told', async () => {
    const { svc, prisma, tasks, notifications } = make();
    prisma.spaceAssignment.findFirst.mockResolvedValue(holder());
    await svc.take({ taskId: 't1', userId: 'u', organizationId: 'org' });
    expect(prisma.taskAssignee.create).toHaveBeenCalledWith({ data: { taskId: 't1', userId: 'u', role: 'LEAD' } });
    expect(tasks.onAssigneesChanged).toHaveBeenCalledWith('t1', ['u'], 'u');
    expect(notifications.emit).toHaveBeenCalledWith('role_task_taken', expect.objectContaining({ notifyIds: ['boss'] }));
  });
});

describe('role pool — handing back', () => {
  const onIt = { id: 'row1' };

  it('a custom flow\'s first step is not "started" — handing back works there', async () => {
    const { svc, prisma, tasks } = make();
    prisma.task.findFirst.mockResolvedValue({ ...OPEN_TASK, status: 'BACKLOG' });
    prisma.taskAssignee.findUnique.mockResolvedValue(onIt);
    await svc.returnToRole({ taskId: 't1', userId: 'u', organizationId: 'org' });
    expect(prisma.taskAssignee.delete).toHaveBeenCalledWith({ where: { id: 'row1' } });
    expect(tasks.onAssigneesChanged).toHaveBeenCalledWith('t1', [], 'u');
  });

  it('once the person has joined the work, it is ROLE_TASK_STARTED', async () => {
    const { svc, prisma } = make();
    prisma.task.findFirst.mockResolvedValue({ ...OPEN_TASK, status: 'BACKLOG' });
    prisma.taskAssignee.findUnique.mockResolvedValue(onIt);
    prisma.taskEvent.count.mockResolvedValue(1);
    const err = await svc.returnToRole({ taskId: 't1', userId: 'u', organizationId: 'org' }).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'ROLE_TASK_STARTED' });
  });

  it('a second hand-back arriving at once is a 404, not a 500', async () => {
    const { svc, prisma } = make();
    prisma.taskAssignee.findUnique.mockResolvedValue(onIt);
    prisma.taskAssignee.delete.mockRejectedValue(Object.assign(new Error('gone'), { code: 'P2025' }));
    await expect(svc.returnToRole({ taskId: 't1', userId: 'u', organizationId: 'org' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('role pool — places and waves', () => {
  it('places are recomputed from the crew in SQL, never written as an absolute number', async () => {
    const { svc, prisma } = make();
    await svc.syncSpots('t1');
    const sql = (prisma.$executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('"openSpots" - (SELECT COUNT(*) FROM "task_assignees"');
    expect(sql).toContain('"openWave" <');
  });

  it('the sweep takes a finished row ("DONE") out of the queue instead of skipping it for ever', async () => {
    const { svc, prisma } = make();
    prisma.task.findMany.mockResolvedValue([{ ...OPEN_TASK, status: 'DONE', openWave: 0, priority: 'MEDIUM', space: null }]);
    await svc.sweep();
    expect(prisma.task.updateMany).toHaveBeenCalledWith({ where: { id: 't1', openWave: 0 }, data: { openWave: ROLE_WAVE_CLOSED, openSpotsLeft: 0 } });
  });
});
