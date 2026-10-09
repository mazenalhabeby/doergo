import { SessionEvents } from '../../../common/session-events/session-events.service';
import { Test, TestingModule } from '@nestjs/testing';
import { SPACE_PERMISSION_KEYS, whitelistPermissions, PERMISSION_KEYS } from '@hbcfield/shared';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * A WORK role (a trade) grants nothing — on EVERY write.
 *
 * task-service forced `{}` on its own role routes; `update_access_role` here did
 * not, so a trade could be handed `canManageUsers` through this door and every
 * holder would inherit it while every screen still called it a trade.
 */
describe('updateAccessRole — a work role never carries permissions', () => {
  let service: UsersService;
  const prisma: Record<string, any> = {
    accessRole: { findFirst: jest.fn(), update: jest.fn() },
    user: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.accessRole.update.mockImplementation(async (a: any) => ({ id: 'r1', permissions: a.data.permissions }));
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

  const save = (role: Record<string, unknown>, permissions: unknown) => {
    prisma.accessRole.findFirst.mockResolvedValueOnce({
      id: 'r1', organizationId: 'org1', isSystem: false, permissions: {}, ...role,
    });
    return service.updateAccessRole({ organizationId: 'org1', roleId: 'r1', permissions });
  };

  it('stores {} for a WORK role, whatever was sent', async () => {
    await save({ scope: 'SPACE', kind: 'WORK' }, { canManageUsers: true, canViewAllTasks: true });
    expect(prisma.accessRole.update.mock.calls[0][0].data.permissions).toEqual({});
  });

  it('keeps a MANAGEMENT space role to the keys that mean something in a space', async () => {
    const orgOnly = PERMISSION_KEYS.find((k) => !SPACE_PERMISSION_KEYS.includes(k));
    const spaceKey = SPACE_PERMISSION_KEYS[0];
    await save({ scope: 'SPACE', kind: 'MANAGEMENT' }, { [spaceKey]: true, ...(orgOnly ? { [orgOnly]: true } : {}) });
    const stored = prisma.accessRole.update.mock.calls[0][0].data.permissions;
    expect(stored[spaceKey]).toBe(true);
    if (orgOnly) expect(stored[orgOnly]).toBeUndefined();
  });

  it('an org role is unchanged: every known key, nothing else', async () => {
    await save({ scope: 'ORG', kind: 'MANAGEMENT' }, { canManageUsers: true, bogus: true });
    expect(prisma.accessRole.update.mock.calls[0][0].data.permissions).toEqual({ canManageUsers: true });
  });
});

describe('whitelistPermissions — the one list both services read', () => {
  it('fails closed on anything that is not a plain object of trues', () => {
    expect(whitelistPermissions(null)).toEqual({});
    expect(whitelistPermissions(['canManageUsers'])).toEqual({});
    expect(whitelistPermissions({ canManageUsers: 'true' })).toEqual({});
  });
  it('the space list is a subset of the org list', () => {
    for (const k of SPACE_PERMISSION_KEYS) expect(PERMISSION_KEYS).toContain(k);
  });
});
