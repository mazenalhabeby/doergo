import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Filtering the team list by role.
 *
 * The Role column shows a member's ASSIGNED ROLE where they have one ("Manager",
 * "Sales") and falls back to the account type otherwise. The filter beside it
 * offered only the two account types, hardcoded — so a role an organization
 * created was visible in every row and selectable in none.
 *
 * One control now covers both kinds of thing, which means it has to tell them
 * apart. The account types are a closed set of upper-case words and are matched
 * first, so a role can never be mistaken for one whatever it is named.
 */
describe('listOrgMembers — role filter', () => {
  let service: UsersService;

  const prisma: Record<string, any> = {
    user: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  };

  const ORG = 'org-1';
  const whereOf = () => prisma.user.findMany.mock.calls[0][0].where;

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

  it('filters by account type for the reserved words', async () => {
    await service.listOrgMembers({ organizationId: ORG, role: 'ADMIN' } as any);
    expect(whereOf()).toMatchObject({ role: 'ADMIN' });
    expect(whereOf().memberRoleId).toBeUndefined();
  });

  it('filters by assigned role for anything else', async () => {
    await service.listOrgMembers({ organizationId: ORG, role: 'cmt0eukmh0003lm4ofx5dtv6q' } as any);
    expect(whereOf()).toMatchObject({ memberRoleId: 'cmt0eukmh0003lm4ofx5dtv6q' });
    // Crucially NOT `role`, which would filter the account type by a cuid and
    // silently return nobody.
    expect(whereOf().role).toBeUndefined();
  });

  it('finds the members holding no role at all', async () => {
    // The state the Employee badge hides: no org-wide permissions whatsoever.
    await service.listOrgMembers({ organizationId: ORG, role: 'none' } as any);
    expect(whereOf()).toMatchObject({ memberRoleId: null });
  });

  it('applies no role filter when none is asked for', async () => {
    await service.listOrgMembers({ organizationId: ORG } as any);
    expect(whereOf().role).toBeUndefined();
    expect(whereOf().memberRoleId).toBeUndefined();
  });

  it('always scopes to the organization and excludes portal customers', async () => {
    // Both are the point of this list: staff of THIS org, never a portal
    // customer who would be re-roled into a staff account by accident.
    await service.listOrgMembers({ organizationId: ORG, role: 'ADMIN' } as any);
    expect(whereOf()).toMatchObject({ organizationId: ORG, customerId: null });
  });
});
