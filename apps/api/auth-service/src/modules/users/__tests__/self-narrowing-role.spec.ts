import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Narrowing a role you hold yourself.
 *
 * From production, 2026-08-31. An admin tried to delete two leftover roles, was
 * refused because a member still held one, and emptied the permissions instead —
 * a reasonable workaround: if it cannot be removed, at least let it grant
 * nothing. The member holding it was them. Their access came from that role, the
 * whole administration navigation vanished, and only a direct database write
 * brought it back.
 *
 * `updateMemberProfile` already refuses to let anybody change their own role.
 * Editing the role they hold is the same act through a different door.
 *
 * The guard is deliberately narrow, and these tests pin the edges: only a
 * REMOVAL of a permission the editor CURRENTLY holds is refused. Renaming,
 * recolouring and adding all stay allowed, because the danger is losing access
 * you are relying on, not editing the role at all.
 */
describe('updateAccessRole — you cannot narrow your own role', () => {
  let service: UsersService;

  const prisma: Record<string, any> = {
    accessRole: { findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
  };

  const ORG = 'org-1';
  const ROLE = 'role-1';
  const ME = 'user-1';

  const roleRow = { id: ROLE, organizationId: ORG, isSystem: false, permissions: { canManageUsers: true, canViewAllTasks: true } };

  /*
    The role lookup answers ONCE, then reports nothing found.

    Renaming a role derives a unique slug by probing for collisions in a loop; a
    mock that returns a row every time never terminates, and the suite dies of
    heap exhaustion rather than failing. The first call is the role being edited,
    every later one is the slug probe finding the name free.
  */
  const findsRole = (row: unknown = roleRow) =>
    prisma.accessRole.findFirst.mockResolvedValueOnce(row).mockResolvedValue(null);

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.accessRole.update.mockResolvedValue({ id: ROLE });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: 'TASK_SERVICE', useValue: { emit: jest.fn() } },
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  const holder = (over = {}) => ({ role: 'EMPLOYEE', memberRoleId: ROLE, ...over });

  it('refuses removing a permission from the role the editor holds', async () => {
    findsRole();
    prisma.user.findFirst.mockResolvedValue(holder());

    const r: any = await service.updateAccessRole({
      organizationId: ORG, requesterId: ME, roleId: ROLE,
      permissions: { canManageUsers: true }, // canViewAllTasks dropped
    });
    expect(r.success).toBe(false);
    expect(r.statusCode).toBe(HttpStatus.CONFLICT);
    expect(prisma.accessRole.update).not.toHaveBeenCalled();
  });

  it('refuses emptying it entirely — the exact production case', async () => {
    findsRole();
    prisma.user.findFirst.mockResolvedValue(holder());

    // What was actually sent: every key present and explicitly false.
    const r: any = await service.updateAccessRole({
      organizationId: ORG, requesterId: ME, roleId: ROLE,
      permissions: { canManageUsers: false, canViewAllTasks: false },
    });
    expect(r.statusCode).toBe(HttpStatus.CONFLICT);
  });

  it('allows ADDING a permission to your own role', async () => {
    // Not a privilege escalation route: the ceiling check downstream still caps
    // what a non-admin may grant. This only says gaining is not losing.
    findsRole();
    prisma.user.findFirst.mockResolvedValue(holder());

    const r: any = await service.updateAccessRole({
      organizationId: ORG, requesterId: ME, roleId: ROLE,
      permissions: { canManageUsers: true, canViewAllTasks: true, canCreateTasks: true },
    });
    expect(r.success).not.toBe(false);
  });

  it('allows renaming your own role without touching permissions', async () => {
    // `permissions` undefined — the guard must not fire on an unrelated edit.
    findsRole();
    const r: any = await service.updateAccessRole({
      organizationId: ORG, requesterId: ME, roleId: ROLE, name: 'Dispatcher',
    });
    expect(r.success).not.toBe(false);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('allows narrowing a role somebody ELSE holds', async () => {
    findsRole();
    prisma.user.findFirst.mockResolvedValue(holder({ memberRoleId: 'some-other-role' }));

    const r: any = await service.updateAccessRole({
      organizationId: ORG, requesterId: ME, roleId: ROLE, permissions: {},
    });
    expect(r.success).not.toBe(false);
  });

  it('lets an ADMIN narrow their own role', async () => {
    /*
      Admins no longer resolve access from a role at all, so for them this cannot
      remove anything — and refusing would block a legitimate tidy-up of exactly
      the leftover roles that started this.
    */
    findsRole();
    prisma.user.findFirst.mockResolvedValue(holder({ role: 'ADMIN' }));

    const r: any = await service.updateAccessRole({
      organizationId: ORG, requesterId: ME, roleId: ROLE, permissions: {},
    });
    expect(r.success).not.toBe(false);
  });
});
