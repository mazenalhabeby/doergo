import { SessionEvents } from '../../../common/session-events/session-events.service';
import { Test, TestingModule } from '@nestjs/testing';
import { BUILTIN_ROLES } from '@hbcfield/shared';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Built-in roles follow their definition in code — additively, until an admin
 * edits them. Custom roles are never touched.
 *
 * From 2026-09-27: the Sales Rep definition gained "add clients" after
 * organizations had been seeded, the lazy seed never updated an existing role,
 * and every rep in those organizations was refused. The fix is not a per-role
 * migration but a rule for every built-in.
 */
describe('built-in roles follow their definition', () => {
  let service: UsersService;
  const prisma: Record<string, any> = {
    $executeRaw: jest.fn(),
    accessRole: { findFirst: jest.fn(), update: jest.fn() },
    user: { findFirst: jest.fn() },
  };
  const sqlOf = (i: number) => {
    const q = prisma.$executeRaw.mock.calls[i][0];
    return { text: (q.strings as string[]).join('?'), values: q.values as unknown[] };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$executeRaw.mockResolvedValue(0);
    prisma.accessRole.update.mockResolvedValue({ id: 'r' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: SessionEvents, useValue: { sessionsRevoked: jest.fn(), organizationSuspended: jest.fn() } },
        { provide: 'TASK_SERVICE', useValue: { emit: jest.fn() } },
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('one statement per built-in, each ADDING its granted permissions (never replacing)', async () => {
    await service.syncBuiltInRoles();
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(BUILTIN_ROLES.length);
    const { text, values } = sqlOf(BUILTIN_ROLES.findIndex((r) => r.slug === 'sales-rep'));
    // `stored || definition` — keys only ever added; nothing the row holds is dropped.
    expect(text).toMatch(/"permissions"::jsonb \|\| \?::jsonb/);
    expect(values).toContain('sales-rep');
    expect(JSON.parse(values[0] as string)).toMatchObject({ crmCreateClients: true });
  });

  it('only built-ins nobody has edited, and only rows that actually lack something', async () => {
    await service.syncBuiltInRoles();
    const { text } = sqlOf(0);
    expect(text).toContain('"isSystem" = true');
    expect(text).toContain('"isCustomized" = false');
    expect(text).toMatch(/NOT \("permissions"::jsonb @> \?::jsonb\)/);
  });

  it('narrowed to one organization when asked (the roles list), all of them at boot', async () => {
    await service.syncBuiltInRoles('org-9');
    expect(sqlOf(0).values).toContain('org-9');
    jest.clearAllMocks();
    prisma.$executeRaw.mockResolvedValue(0);
    await service.syncBuiltInRoles();
    expect(sqlOf(0).values).not.toContain('org-9');
  });

  describe('an admin edit makes a built-in the organization\'s own', () => {
    const builtIn = { id: 'r', organizationId: 'o', isSystem: true, permissions: { crmViewOwn: true, crmCreateClients: true } };
    const run = (permissions: Record<string, boolean>, row = builtIn) => {
      prisma.accessRole.findFirst.mockResolvedValueOnce(row).mockResolvedValue(null);
      return service.updateAccessRole({ organizationId: 'o', roleId: 'r', permissions });
    };

    it('removing a permission marks it customized — code never re-grants what an admin took away', async () => {
      await run({ crmViewOwn: true });
      expect(prisma.accessRole.update.mock.calls[0][0].data.isCustomized).toBe(true);
    });

    it('saving the SAME set does not (a rename or colour keeps it following its definition)', async () => {
      await run({ crmCreateClients: true, crmViewOwn: true, crmWork: false });
      expect(prisma.accessRole.update.mock.calls[0][0].data.isCustomized).toBeUndefined();
    });

    it('a custom role is never marked — it has no definition to follow', async () => {
      await run({ crmViewOwn: true }, { ...builtIn, isSystem: false });
      expect(prisma.accessRole.update.mock.calls[0][0].data.isCustomized).toBeUndefined();
    });
  });
});
