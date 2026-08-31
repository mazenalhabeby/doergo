import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * How many people hold each role.
 *
 * The Roles dialog listed "13 permissions" and said nothing about people, so a
 * role nobody held looked exactly like one half the company held — and the
 * difference only appeared as a refusal after pressing Delete.
 *
 * Counted with a single groupBy rather than a count per role. The list is short
 * today, but a query inside the map is an N+1 over precisely the thing an
 * organization accumulates more of, and this runs on every open of the dialog.
 */
describe('listAccessRoles — member counts', () => {
  let service: UsersService;

  const prisma: Record<string, any> = {
    accessRole: { findMany: jest.fn(), upsert: jest.fn().mockResolvedValue({}) },
    user: { groupBy: jest.fn() },
  };

  const ORG = 'org-1';

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: 'TASK_SERVICE', useValue: { emit: jest.fn() } },
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  const roles = [
    { id: 'admin', name: 'Admin', slug: 'admin', isSystem: true, permissions: {} },
    { id: 'mgr', name: 'Manager', slug: 'manager', isSystem: true, permissions: {} },
    { id: 'custom', name: 'Custom', slug: 'custom', isSystem: false, permissions: {} },
  ];

  it('attaches a count to every role, zero included', async () => {
    prisma.accessRole.findMany.mockResolvedValue(roles);
    prisma.user.groupBy.mockResolvedValue([
      { memberRoleId: 'mgr', _count: { _all: 3 } },
      { memberRoleId: 'custom', _count: { _all: 1 } },
    ]);

    const result: any = await service.listAccessRoles({ organizationId: ORG });
    const byId = Object.fromEntries(result.data.map((r: any) => [r.id, r.memberCount]));

    // A role with nobody must report 0, not undefined — the screen renders it.
    expect(byId).toEqual({ admin: 0, mgr: 3, custom: 1 });
  });

  it('counts with ONE query, not one per role', async () => {
    prisma.accessRole.findMany.mockResolvedValue(roles);
    prisma.user.groupBy.mockResolvedValue([]);

    await service.listAccessRoles({ organizationId: ORG });
    expect(prisma.user.groupBy).toHaveBeenCalledTimes(1);
  });

  it('counts only active members of this organization', async () => {
    /*
      Both halves matter. Another org's members would be a cross-tenant leak of
      headcount; a deactivated member would explain a delete refusal by pointing
      at somebody who has left.
    */
    prisma.accessRole.findMany.mockResolvedValue(roles);
    prisma.user.groupBy.mockResolvedValue([]);

    await service.listAccessRoles({ organizationId: ORG });
    const where = prisma.user.groupBy.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: ORG, isActive: true });
  });
});
