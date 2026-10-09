import { BadRequestException } from '@nestjs/common';
import { SpaceRolesService } from '../space-roles.service';

/**
 * A member's routing may only name roles and people of the SAME organization.
 * The ids were stored as sent, and the notification/chat resolvers read them
 * back — a foreign id meant another organization's member was told about
 * this one's shifts.
 */
describe('updateMemberRouting stays inside the organization', () => {
  const build = (roleCount: number, userCount: number) => {
    const prisma: any = {
      spaceAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sa1' }),
        update: jest.fn().mockResolvedValue({ id: 'sa1' }),
      },
      accessRole: { count: jest.fn().mockResolvedValue(roleCount) },
      user: { count: jest.fn().mockResolvedValue(userCount) },
    };
    return { svc: new SpaceRolesService(prisma), prisma };
  };
  const base = { organizationId: 'org1', spaceId: 's1', memberId: 'sa1' };

  it('refuses a person from another organization, and writes nothing', async () => {
    const { svc, prisma } = build(1, 1);
    await expect(
      svc.updateMemberRouting({ ...base, notifyRoleIds: ['r1'], notifyUserIds: ['u-mine'], contactUserIds: ['u-foreign'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { id: { in: ['u-mine', 'u-foreign'] }, organizationId: 'org1' } });
    expect(prisma.spaceAssignment.update).not.toHaveBeenCalled();
  });

  it('refuses a role from another organization', async () => {
    const { svc, prisma } = build(0, 0);
    await expect(svc.updateMemberRouting({ ...base, approveRoleIds: ['r-foreign'] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.spaceAssignment.update).not.toHaveBeenCalled();
  });

  it('saves when every id is the organization’s own (a repeated id counts once)', async () => {
    const { svc, prisma } = build(1, 2);
    await svc.updateMemberRouting({ ...base, notifyRoleIds: ['r1', 'r1'], notifyUserIds: ['u1'], approveUserIds: ['u2', 'u1'] });
    expect(prisma.spaceAssignment.update).toHaveBeenCalled();
  });

  it('clearing a list asks nothing', async () => {
    const { svc, prisma } = build(0, 0);
    await svc.updateMemberRouting({ ...base, notifyUserIds: [] });
    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.spaceAssignment.update).toHaveBeenCalled();
  });
});
