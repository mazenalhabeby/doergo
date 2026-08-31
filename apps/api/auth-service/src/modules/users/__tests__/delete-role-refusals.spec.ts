import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Deleting a role that is still in use.
 *
 * Reported from production: three roles, each held by one member, and every
 * delete answered **500 Internal server error**. The server was making the right
 * decision — a role in use must not vanish from under the people holding it —
 * and then losing the reason on the way back.
 *
 * The cause is the boundary, not the rule. An exception raised inside a
 * @MessagePattern handler is serialised across Redis as `{ status: 'error',
 * message }`: the HTTP status does not survive, so what reaches the gateway is
 * not an HttpException, its filter falls through to its default, and a
 * deliberate 409 arrives as an unexplained 500.
 *
 * So these assert the SHAPE as much as the rule. The gateway reads
 * `result.success === false` and re-raises it with `result.statusCode`; a
 * refusal that throws instead of returning is invisible to that check, however
 * correct its reasoning was.
 */
describe('deleteAccessRole — refusals survive the microservice boundary', () => {
  let service: UsersService;

  const prisma: Record<string, any> = {
    user: { count: jest.fn() },
    accessRole: { findFirst: jest.fn(), delete: jest.fn() },
  };

  const ORG = 'org-1';
  const custom = { id: 'role-1', organizationId: ORG, isSystem: false, permissions: {} };

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

  it('refuses a role that members still hold, and says how many', async () => {
    prisma.accessRole.findFirst.mockResolvedValue(custom);
    prisma.user.count.mockResolvedValue(1);

    const result: any = await service.deleteAccessRole({ organizationId: ORG, roleId: custom.id });

    // Returned, never thrown — the whole point.
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(HttpStatus.CONFLICT);
    expect(result.message).toContain('1 member');
    // Singular, because "1 members" is how software announces that nobody read it.
    expect(result.message).not.toContain('1 members');
    expect(prisma.accessRole.delete).not.toHaveBeenCalled();
  });

  it('pluralises when more than one member holds it', async () => {
    prisma.accessRole.findFirst.mockResolvedValue(custom);
    prisma.user.count.mockResolvedValue(4);

    const result: any = await service.deleteAccessRole({ organizationId: ORG, roleId: custom.id });
    expect(result.message).toContain('4 members');
  });

  it('refuses a built-in role', async () => {
    prisma.accessRole.findFirst.mockResolvedValue({ ...custom, isSystem: true });

    const result: any = await service.deleteAccessRole({ organizationId: ORG, roleId: custom.id });
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.accessRole.delete).not.toHaveBeenCalled();
  });

  it('reports a missing role as 404 rather than a crash', async () => {
    prisma.accessRole.findFirst.mockResolvedValue(null);

    const result: any = await service.deleteAccessRole({ organizationId: ORG, roleId: 'nope' });
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(HttpStatus.NOT_FOUND);
  });

  it('scopes the lookup to the caller organization', async () => {
    // Not about the message: a role id from another tenant must not be findable,
    // which is what makes the 404 above a boundary and not just a nicety.
    prisma.accessRole.findFirst.mockResolvedValue(null);
    await service.deleteAccessRole({ organizationId: ORG, roleId: 'role-elsewhere' });

    expect(prisma.accessRole.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) }),
    );
  });

  it('deletes a custom role nobody holds', async () => {
    prisma.accessRole.findFirst.mockResolvedValue(custom);
    prisma.user.count.mockResolvedValue(0);
    prisma.accessRole.delete.mockResolvedValue(custom);

    const result: any = await service.deleteAccessRole({ organizationId: ORG, roleId: custom.id });
    expect(result.success).toBe(true);
    expect(prisma.accessRole.delete).toHaveBeenCalledWith({ where: { id: custom.id } });
  });
});
