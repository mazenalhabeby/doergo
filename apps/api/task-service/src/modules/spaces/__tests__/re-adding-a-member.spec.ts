import { SpaceMembershipService } from '../space-membership.service';
import { SpaceMembersService } from '../../space-roles/space-members.service';

/*
  Re-adding somebody already in a workspace must change nothing (it used to reset their start day, primary flag,
  schedule and end); re-adding a FORMER member (row ended when they left) must make them a member again — and
  the roster must not list former members as if they were still here.
*/
const PAST = new Date('2020-01-01T00:00:00Z');

function prismaFor(existing: { effectiveTo: Date | null; roleId?: string | null } | null) {
  const upsert = jest.fn().mockResolvedValue({
    id: 'a1',
    userId: 'u1',
    spaceId: 's1',
    roleId: null,
    space: { id: 's1' },
    user: {},
    role: null,
    workRole: null,
  });
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', isExternal: false }) },
    companyLocation: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
    spaceAssignment: {
      findUnique: jest.fn().mockResolvedValue(existing ? { id: 'a1', roleId: null, workRoleId: null, ...existing } : null),
      updateMany: jest.fn(),
      upsert,
    },
    accessRole: { deleteMany: jest.fn() },
  };
  return { prisma, upsert };
}

describe('assignTechnician (the workspace roster)', () => {
  const svc = (prisma: any) => new SpaceMembershipService(prisma, { announce: jest.fn() } as any);
  const base = { userId: 'u1', locationId: 's1', requestingUserId: 'adm', organizationId: 'o1' };

  it('re-adding a current member changes nothing that was not sent', async () => {
    const { prisma, upsert } = prismaFor({ effectiveTo: null });
    await svc(prisma).assignTechnician(base);
    expect(upsert.mock.calls[0][0].update).toEqual({});
  });

  it('only the fields sent are written', async () => {
    const { prisma, upsert } = prismaFor({ effectiveTo: null });
    await svc(prisma).assignTechnician({ ...base, schedule: ['MON'], isPrimary: false });
    expect(upsert.mock.calls[0][0].update).toEqual({ schedule: ['MON'], isPrimary: false });
  });

  it('a former member re-added is reopened', async () => {
    const { prisma, upsert } = prismaFor({ effectiveTo: PAST });
    await svc(prisma).assignTechnician(base);
    const update = upsert.mock.calls[0][0].update;
    expect(update.effectiveTo).toBeNull();
    expect(update.effectiveFrom).toBeInstanceOf(Date);
  });

  it('a planned end in the future is kept', async () => {
    const { prisma, upsert } = prismaFor({ effectiveTo: new Date(Date.now() + 86_400_000) });
    await svc(prisma).assignTechnician(base);
    expect(upsert.mock.calls[0][0].update).toEqual({});
  });
});

describe('assignMember (space roles)', () => {
  const base = { organizationId: 'o1', spaceId: 's1', userId: 'u1' };

  it('a former member re-added: the row reopens (as the invitation placement does)', async () => {
    const { prisma, upsert } = prismaFor({ effectiveTo: PAST });
    await new SpaceMembersService(prisma).assignMember(base);
    expect(upsert.mock.calls[0][0].update).toMatchObject({ roleId: null, effectiveTo: null });
  });

  it('a current member: the end is not touched', async () => {
    const { prisma, upsert } = prismaFor({ effectiveTo: null });
    await new SpaceMembersService(prisma).assignMember(base);
    expect(upsert.mock.calls[0][0].update).toEqual({ roleId: null });
  });

  it('bringing a former member back needs the right to add people', async () => {
    const { prisma, upsert } = prismaFor({ effectiveTo: PAST });
    await expect(
      new SpaceMembersService(prisma).assignMember({
        ...base,
        authority: { addMembers: false, grantRoles: true, manageTerms: true },
      }),
    ).rejects.toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('listMembers leaves out rows that have ended', async () => {
    const { prisma } = prismaFor(null);
    prisma.spaceAssignment.findMany = jest.fn().mockResolvedValue([]);
    prisma.companyLocation.findUnique = jest.fn().mockResolvedValue(null);
    prisma.organization = { findUnique: jest.fn().mockResolvedValue(null) };
    prisma.user.findMany = jest.fn().mockResolvedValue([]);
    prisma.rateHistory = { findMany: jest.fn().mockResolvedValue([]) };
    await new SpaceMembersService(prisma).listMembers({ organizationId: 'o1', spaceId: 's1' }).catch(() => undefined);
    const where = prisma.spaceAssignment.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: 'o1', spaceId: 's1' });
    expect(where.OR).toEqual([{ effectiveTo: null }, { effectiveTo: { gte: expect.any(Date) } }]);
  });
});
