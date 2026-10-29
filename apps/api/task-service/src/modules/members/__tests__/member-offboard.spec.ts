import { MemberOffboardService } from '../member-offboard.service';

/*
  Leaving releases open work, returns equipment and ENDS (not deletes) the
  workspace assignments — and nothing finished is touched, which is what the
  old account-deletion path got wrong (it reset every task ever held to NEW).
*/
describe('MemberOffboardService', () => {
  const setup = () => {
    const prisma: any = {
      spaceAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      technicianSchedule: { deleteMany: jest.fn().mockResolvedValue({ count: 5 }) },
      timeOff: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
      shiftAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      shiftInstance: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const tasks: any = { releaseMemberFromOpenWork: jest.fn().mockResolvedValue(3) };
    const custody: any = { releaseAllHeldBy: jest.fn().mockResolvedValue(1) };
    const closer: any = { closeEntry: jest.fn() };
    return { prisma, tasks, custody, closer, service: new MemberOffboardService(prisma, tasks, custody, closer) };
  };

  it('releases open jobs, returns equipment and ends assignments', async () => {
    const { prisma, tasks, custody, service } = setup();
    const r = await service.offboard({ organizationId: 'o1', userId: 'u1', actorId: 'admin' });
    expect(r).toEqual({
      tasksReleased: 3,
      assetsReturned: 1,
      assignmentsEnded: 2,
      schedulesRemoved: 5,
      timeOffErased: 0,
      shiftsClosed: 0,
      rotaEnded: 2,
    });
    expect(prisma.technicianSchedule.deleteMany).toHaveBeenCalledWith({ where: { technicianId: 'u1' } });
    // A removal keeps the leave record — only the person erasing their account takes it.
    expect(prisma.timeOff.deleteMany).not.toHaveBeenCalled();
    expect(tasks.releaseMemberFromOpenWork).toHaveBeenCalledWith('o1', 'u1', 'admin');
    expect(custody.releaseAllHeldBy).toHaveBeenCalledWith('o1', 'u1', 'admin');
    const call = prisma.spaceAssignment.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ userId: 'u1', space: { organizationId: 'o1' } });
    expect(call.data.effectiveTo).toBeInstanceOf(Date);
  });

  it('ends their rota everywhere in the organization and drops the shifts ahead — never a daily no-show', async () => {
    const { prisma, service } = setup();
    await service.offboard({ organizationId: 'o1', userId: 'u1', actorId: 'admin' });
    const rota = prisma.shiftAssignment.updateMany.mock.calls[0][0];
    expect(rota.where).toMatchObject({ organizationId: 'o1', userId: 'u1' });
    expect(rota.where.spaceId).toBeUndefined();
    expect(rota.data.effectiveTo).toBeInstanceOf(Date); // ended, never deleted
    expect(prisma.shiftInstance.deleteMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'o1',
      userId: 'u1',
      state: 'PENDING',
    });
  });

  it('looks for a shift still running (closed through the office close — leaver-close.spec)', async () => {
    const { prisma, service } = setup();
    await service.offboard({ organizationId: 'o1', userId: 'u1', actorId: 'admin' });
    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'o1',
      userId: 'u1',
      status: 'CLOCKED_IN',
    });
  });

  it('a revoked share takes the guests off the rota there too', async () => {
    const { prisma, service } = setup();
    const tx = {
      spaceAssignment: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      shiftAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      shiftInstance: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    prisma.companyLocation = { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) };
    prisma.spaceAssignment.findMany = jest.fn().mockResolvedValue([{ userId: 'g1' }, { userId: 'g2' }]);
    prisma.$transaction = (fn: (t: unknown) => unknown) => fn(tx);
    const r = await service.releaseSharedSpace({ ownerOrgId: 'own', spaceId: 's1', guestOrgId: 'guest' });
    expect(r).toEqual({ assignmentsRemoved: 2 });
    expect(tx.shiftAssignment.updateMany.mock.calls[0][0].where).toMatchObject({
      spaceId: 's1',
      userId: { in: ['g1', 'g2'] },
    });
  });

  it('a member switched off comes off every unfinished crew (lead, places, checklist and chat follow)', async () => {
    const { tasks, service } = setup();
    const r = await service.deactivated({ organizationId: 'o1', userId: 'u1' });
    expect(tasks.releaseMemberFromOpenWork).toHaveBeenCalledWith('o1', 'u1', 'u1', 'MEMBER_DEACTIVATED');
    expect(r.tasksReleased).toBe(3);
  });

  it('an account deletion also erases the leave record', async () => {
    const { prisma, service } = setup();
    const r = await service.offboard({ organizationId: 'o1', userId: 'u1', actorId: 'u1', erase: true });
    expect(prisma.timeOff.deleteMany).toHaveBeenCalledWith({ where: { technicianId: 'u1' } });
    expect(r.timeOffErased).toBe(4);
  });
});

// TasksService hands this to TaskCrewMembersService, which is where it lives.
describe('TasksService.releaseMemberFromOpenWork', () => {
  it('only looks at jobs that are not finished, closed or canceled', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TaskCrewMembersService } = require('../../tasks/assignment/task-crew-members.service');
    const { TERMINAL_STATUSES } = require('@hbcfield/shared');
    const prisma: any = { task: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = Object.create(TaskCrewMembersService.prototype);
    svc.prisma = prisma;
    await svc.releaseMemberFromOpenWork('o1', 'u1', 'admin');
    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'o1', status: { notIn: TERMINAL_STATUSES } });
  });
});

describe('TasksService.releaseMemberFromOpenWork — a custom flow’s finish is history too', () => {
  it('keeps the leaver on a job its workflow calls finished (Delivered, Done…)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TaskCrewMembersService } = require('../../tasks/assignment/task-crew-members.service');
    const prisma: any = {
      task: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'delivered', status: 'DELIVERED', workflowId: 'logistics' },
          { id: 'en-route', status: 'IN_TRANSIT', workflowId: 'logistics' },
        ]),
        updateMany: jest.fn(),
      },
      workflowStatus: { findMany: jest.fn().mockResolvedValue([{ workflowId: 'logistics', key: 'DELIVERED' }]) },
      taskAssignee: { deleteMany: jest.fn() },
    };
    const svc = Object.create(TaskCrewMembersService.prototype);
    svc.prisma = prisma;
    svc.crewChange = { afterAssigneesChanged: jest.fn() };
    svc.support = { createTaskEvent: jest.fn() };
    const n = await svc.releaseMemberFromOpenWork('o1', 'u1', 'admin');
    expect(n).toBe(1);
    expect(prisma.taskAssignee.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.taskAssignee.deleteMany).toHaveBeenCalledWith({ where: { taskId: 'en-route', userId: 'u1' } });
  });
});

describe('MemberOffboardService.releaseSharedSpace', () => {
  const build = (space: unknown) => {
    const prisma: any = {
      companyLocation: { findFirst: jest.fn().mockResolvedValue(space) },
      spaceAssignment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
    return { prisma, service: new MemberOffboardService(prisma, {} as any, {} as any, {} as any) };
  };

  it('removes only the guest organization’s people from that workspace', async () => {
    const { prisma, service } = build({ id: 's1' });
    const r = await service.releaseSharedSpace({ ownerOrgId: 'owner', spaceId: 's1', guestOrgId: 'guest' });
    expect(prisma.companyLocation.findFirst.mock.calls[0][0].where).toEqual({ id: 's1', organizationId: 'owner' });
    expect(prisma.spaceAssignment.deleteMany).toHaveBeenCalledWith({ where: { spaceId: 's1', organizationId: 'guest' } });
    expect(r).toEqual({ assignmentsRemoved: 3 });
  });

  it('a workspace that is not the owner’s empties nothing', async () => {
    const { prisma, service } = build(null);
    expect(await service.releaseSharedSpace({ ownerOrgId: 'owner', spaceId: 's-other', guestOrgId: 'guest' })).toEqual({ assignmentsRemoved: 0 });
    expect(prisma.spaceAssignment.deleteMany).not.toHaveBeenCalled();
  });

  it('never removes the owner’s own people', async () => {
    const { prisma, service } = build({ id: 's1' });
    await service.releaseSharedSpace({ ownerOrgId: 'owner', spaceId: 's1', guestOrgId: 'owner' });
    expect(prisma.spaceAssignment.deleteMany).not.toHaveBeenCalled();
  });
});
