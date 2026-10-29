import { EmployeesService } from '../employees.service';
import { EmployeeWriteService } from '../employee-write.service';

/*
  Switching a member off left a shift they had running open — counting, and chasing a leader every day, for somebody
  who could no longer sign in to clock out. Both ways of switching them off now tell task-service
  (`member_deactivated`), which closes it through the office close.
*/
describe('a member switched off is announced to task-service', () => {
  const told = (client: { emit: jest.Mock }) =>
    client.emit.mock.calls.filter(([name]) => name === 'member_deactivated').map(([, data]) => data);

  it('Deactivate', async () => {
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }), update: jest.fn() },
      refreshToken: { deleteMany: jest.fn() },
      task: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      workflowStatus: { findMany: jest.fn().mockResolvedValue([]) },
      taskAssignee: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const client = { emit: jest.fn() };
    const svc = new EmployeesService(prisma, undefined, client as any);
    await svc.deactivateEmployee('u1', 'o1');
    expect(told(client)).toEqual([{ organizationId: 'o1', userId: 'u1' }]);
  });

  it('Deactivate counts every unfinished job they are on — crew rows and a custom flow’s steps too', async () => {
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }), update: jest.fn() },
      task: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'crew-job', status: 'IN_TRANSIT', workflowId: 'logistics' },
          { id: 'done-job', status: 'DELIVERED', workflowId: 'logistics' },
        ]),
      },
      workflowStatus: { findMany: jest.fn().mockResolvedValue([{ workflowId: 'logistics', key: 'DELIVERED' }]) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const svc = new EmployeesService(prisma, undefined, { emit: jest.fn() } as any);
    await expect(svc.deactivateEmployee('u1', 'o1')).rejects.toThrow('1 active task');
    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'o1',
      OR: [{ assignedToId: 'u1' }, { assignees: { some: { userId: 'u1' } } }],
    });
  });

  it('the edit form’s switch — and only when it switches them off', async () => {
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'u1' }),
        update: jest.fn().mockResolvedValue({ id: 'u1' }),
      },
      refreshToken: { deleteMany: jest.fn() },
    };
    const client = { emit: jest.fn() };
    const svc = new EmployeeWriteService(prisma, undefined, client as any);
    await svc.updateEmployee('u1', 'o1', { firstName: 'Mike' } as any);
    expect(told(client)).toEqual([]);
    await svc.updateEmployee('u1', 'o1', { isActive: false } as any);
    expect(told(client)).toEqual([{ organizationId: 'o1', userId: 'u1' }]);
  });
});
