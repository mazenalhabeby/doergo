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
    };
    const tasks: any = { releaseMemberFromOpenWork: jest.fn().mockResolvedValue(3) };
    const custody: any = { releaseAllHeldBy: jest.fn().mockResolvedValue(1) };
    return { prisma, tasks, custody, service: new MemberOffboardService(prisma, tasks, custody) };
  };

  it('releases open jobs, returns equipment and ends assignments', async () => {
    const { prisma, tasks, custody, service } = setup();
    const r = await service.offboard({ organizationId: 'o1', userId: 'u1', actorId: 'admin' });
    expect(r).toEqual({ tasksReleased: 3, assetsReturned: 1, assignmentsEnded: 2, schedulesRemoved: 5, timeOffErased: 0 });
    expect(prisma.technicianSchedule.deleteMany).toHaveBeenCalledWith({ where: { technicianId: 'u1' } });
    // A removal keeps the leave record — only the person erasing their account takes it.
    expect(prisma.timeOff.deleteMany).not.toHaveBeenCalled();
    expect(tasks.releaseMemberFromOpenWork).toHaveBeenCalledWith('o1', 'u1', 'admin');
    expect(custody.releaseAllHeldBy).toHaveBeenCalledWith('o1', 'u1', 'admin');
    const call = prisma.spaceAssignment.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ userId: 'u1', space: { organizationId: 'o1' } });
    expect(call.data.effectiveTo).toBeInstanceOf(Date);
  });

  it('an account deletion also erases the leave record', async () => {
    const { prisma, service } = setup();
    const r = await service.offboard({ organizationId: 'o1', userId: 'u1', actorId: 'u1', erase: true });
    expect(prisma.timeOff.deleteMany).toHaveBeenCalledWith({ where: { technicianId: 'u1' } });
    expect(r.timeOffErased).toBe(4);
  });
});

// TasksService hands this to TaskAssignmentService, which is where it lives.
describe('TasksService.releaseMemberFromOpenWork', () => {
  it('only looks at jobs that are not finished, closed or canceled', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TaskAssignmentService } = require('../../tasks/task-assignment.service');
    const { TERMINAL_STATUSES } = require('@hbcfield/shared');
    const prisma: any = { task: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = Object.create(TaskAssignmentService.prototype);
    svc.prisma = prisma;
    await svc.releaseMemberFromOpenWork('o1', 'u1', 'admin');
    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'o1', status: { notIn: TERMINAL_STATUSES } });
  });
});

describe('TasksService.releaseMemberFromOpenWork — a custom flow’s finish is history too', () => {
  it('keeps the leaver on a job its workflow calls finished (Delivered, Done…)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TaskAssignmentService } = require('../../tasks/task-assignment.service');
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
    const svc = Object.create(TaskAssignmentService.prototype);
    svc.prisma = prisma;
    svc.afterAssigneesChanged = jest.fn();
    svc.support = { createTaskEvent: jest.fn() };
    const n = await svc.releaseMemberFromOpenWork('o1', 'u1', 'admin');
    expect(n).toBe(1);
    expect(prisma.taskAssignee.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.taskAssignee.deleteMany).toHaveBeenCalledWith({ where: { taskId: 'en-route', userId: 'u1' } });
  });
});
