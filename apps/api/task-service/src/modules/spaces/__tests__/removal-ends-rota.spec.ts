import { SpaceMembershipService } from '../space-membership.service';
import { SpaceLifecycleService } from '../space-lifecycle.service';
import { MemberRolesService } from '../../space-roles/member-roles.service';

/*
  Taking somebody off a workspace (either route) or archiving it used to leave their rota rows running: the
  materializer kept expecting them, a no-show every day for a person who no longer worked there. Each path now
  ends the rota THERE (and only there) in the same transaction as the removal — and leaves an open shift alone,
  so the member can still clock out where they clocked in.
*/
const rotaTables = () => ({
  shiftAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  shiftInstance: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
});

function prismaWith(extra: Record<string, unknown>) {
  const tx: any = { ...rotaTables(), spaceAssignment: { delete: jest.fn() }, ...extra };
  const prisma: any = {
    ...tx,
    timeEntry: { updateMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { prisma, tx };
}

describe('a removal ends the rota there', () => {
  it('removeAssignment (the workspace roster): this person, this workspace', async () => {
    const { prisma, tx } = prismaWith({});
    prisma.spaceAssignment.findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'a1', organizationId: 'o1', userId: 'u1', spaceId: 's1', role: null });
    const svc = new SpaceMembershipService(prisma, { announce: jest.fn() } as any);
    await svc.removeAssignment({ assignmentId: 'a1', organizationId: 'o1' });
    expect(tx.spaceAssignment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(tx.shiftAssignment.updateMany.mock.calls[0][0].where).toMatchObject({ userId: 'u1', spaceId: 's1' });
    expect(tx.shiftAssignment.updateMany.mock.calls[0][0].data.effectiveTo).toBeInstanceOf(Date);
    expect(tx.shiftInstance.deleteMany.mock.calls[0][0].where).toMatchObject({ userId: 'u1', spaceId: 's1' });
    // The open shift is not touched: clocking out still works there.
    expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled();
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it('removeMember (the space-roles route): the same', async () => {
    const { prisma, tx } = prismaWith({});
    prisma.spaceAssignment.findFirst = jest.fn().mockResolvedValue({ id: 'a1', userId: 'u1', spaceId: 's1', role: null });
    const svc = new MemberRolesService(prisma);
    await svc.removeMember({ organizationId: 'o1', spaceId: 's1', memberId: 'a1' });
    expect(tx.spaceAssignment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(tx.shiftAssignment.updateMany.mock.calls[0][0].where).toMatchObject({ userId: 'u1', spaceId: 's1' });
    expect(prisma.timeEntry.updateMany).not.toHaveBeenCalled();
  });

  it('archiving a workspace ends EVERY member’s rota there', async () => {
    const { prisma, tx } = prismaWith({
      companyLocation: { update: jest.fn().mockResolvedValue({ id: 's1' }) },
      task: { updateMany: jest.fn() },
    });
    prisma.companyLocation = {
      findFirst: jest.fn().mockResolvedValue({ id: 's1', isDefault: false, isRemote: false, _count: { tasks: 0 } }),
    };
    const svc = new SpaceLifecycleService(prisma, { announce: jest.fn() } as any, {} as any);
    await svc.remove({ id: 's1', organizationId: 'o1', userId: 'admin' });
    const where = tx.shiftAssignment.updateMany.mock.calls[0][0].where;
    expect(where.spaceId).toBe('s1');
    expect(where.userId).toBeUndefined();
    expect(tx.shiftInstance.deleteMany.mock.calls[0][0].where).toMatchObject({ spaceId: 's1', state: 'PENDING' });
  });
});
