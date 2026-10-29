/**
 * When the LEAD leaves a crew (hands a role place back, is taken off, declines,
 * leaves the company) and others remain, the earliest of them becomes the LEAD
 * row — so the next taker of a role place is a MEMBER, never a new leader who
 * jumps ahead of everybody already on the job.
 */
import { TaskCrewChangeService } from '../assignment/task-crew-change.service';

function setup(rows: Array<{ id: string; userId: string; role: 'LEAD' | 'MEMBER' }>) {
  const prisma: any = {
    taskAssignee: {
      findFirst: jest.fn().mockImplementation(async ({ where, orderBy }: any) => {
        const hit = rows.filter((r) => !where.role || r.role === where.role);
        expect(where.role || orderBy).toBeTruthy();
        return hit[0] ?? null;
      }),
      updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
        rows.filter((r) => r.id === where.id && r.role === where.role).forEach((r) => (r.role = data.role));
        return { count: 1 };
      }),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockImplementation(async () => rows.map((r) => ({ userId: r.userId }))),
    },
    task: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue({ leadOverrideId: null, assignedToId: null }),
    },
    checklistItem: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    conversation: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const roleOpening: any = { syncSpots: jest.fn().mockResolvedValue(undefined) };
  const service = new TaskCrewChangeService(prisma, { emit: jest.fn() } as any, {} as any, roleOpening);
  return { service, prisma, rows, roleOpening };
}

describe('the lead leaves; the crew keeps a lead', () => {
  it('promotes the earliest remaining member to LEAD and makes them the primary', async () => {
    // The lead handed their place back; Priya (earlier) and Conor remain as members.
    const s = setup([
      { id: 'a-priya', userId: 'priya', role: 'MEMBER' },
      { id: 'a-conor', userId: 'conor', role: 'MEMBER' },
    ]);
    await s.service.afterAssigneesChanged('job1', [], 'office');
    expect(s.rows.find((r) => r.userId === 'priya')!.role).toBe('LEAD');
    expect(s.rows.find((r) => r.userId === 'conor')!.role).toBe('MEMBER');
    expect(s.prisma.task.update).toHaveBeenCalledWith({ where: { id: 'job1' }, data: { assignedToId: 'priya' } });
    // Places follow the crew, as on every change.
    expect(s.roleOpening.syncSpots).toHaveBeenCalledWith('job1');
  });

  it('leaves a named LEAD alone', async () => {
    const s = setup([
      { id: 'a-priya', userId: 'priya', role: 'MEMBER' },
      { id: 'a-conor', userId: 'conor', role: 'LEAD' },
    ]);
    await s.service.afterAssigneesChanged('job1', [], 'office');
    expect(s.prisma.taskAssignee.updateMany).not.toHaveBeenCalled();
    expect(s.prisma.task.update).toHaveBeenCalledWith({ where: { id: 'job1' }, data: { assignedToId: 'conor' } });
  });

  it('nobody left: nobody leads, and the job is not pushed to ASSIGNED', async () => {
    const s = setup([]);
    await s.service.afterAssigneesChanged('job1', [], 'office');
    expect(s.prisma.task.update).toHaveBeenCalledWith({ where: { id: 'job1' }, data: { assignedToId: null } });
    expect(s.prisma.task.updateMany.mock.calls[0][0].where).toMatchObject({ assignedToId: { not: null } });
  });
});
