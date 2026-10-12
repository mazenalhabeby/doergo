import { SessionEvents } from '../../../common/session-events/session-events.service';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users.service';
import { USERS_SERVICES } from '../users-services';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * A personal role (one person's permissions in one workspace, built in the
 * permission builder) is nobody else's to see, pick, edit or delete as a role.
 * The org Access panel is the other door into the role table — it must not
 * list one, nor find one by id.
 */
describe('org role doors never reach a personal role', () => {
  let service: UsersService;
  const prisma: Record<string, any> = {
    accessRole: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(0),
    user: { groupBy: jest.fn().mockResolvedValue([]) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: SessionEvents, useValue: { sessionsRevoked: jest.fn(), organizationSuspended: jest.fn() } },
        { provide: 'TASK_SERVICE', useValue: { emit: jest.fn() } },
        ...USERS_SERVICES,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('the role list excludes them, for org and space pickers alike', async () => {
    for (const scope of [undefined, 'space'] as const) {
      prisma.accessRole.findMany.mockClear();
      await service.listAccessRoles({ organizationId: 'org-1', scope });
      expect(prisma.accessRole.findMany.mock.calls[0][0].where).toMatchObject({ personalAssignmentId: null });
    }
  });

  it('editing and deleting look them up as not found', async () => {
    await expect(service.updateAccessRole({ organizationId: 'org-1', roleId: 'r-personal', name: 'x' })).rejects.toThrow('Role not found');
    expect(prisma.accessRole.findFirst.mock.calls[0][0].where).toMatchObject({ personalAssignmentId: null });
    const res: any = await service.deleteAccessRole({ organizationId: 'org-1', roleId: 'r-personal' });
    expect(res).toMatchObject({ success: false, statusCode: 404 });
  });

  it('the built-in catch-up statement never touches one', async () => {
    await service.listAccessRoles({ organizationId: 'org-1' });
    const sql = prisma.$executeRaw.mock.calls.map((c: any[]) => (c[0]?.strings ?? []).join('?')).join('\n');
    expect(sql).toContain('"personalAssignmentId" IS NULL');
  });
});
