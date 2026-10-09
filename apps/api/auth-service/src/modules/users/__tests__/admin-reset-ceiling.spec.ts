import { SessionEvents } from '../../../common/session-events/session-events.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@hbcfield/shared';
import { UsersService } from '../users.service';
import { USERS_SERVICES } from '../users-services';
import { PrismaService } from '../../../common/prisma/prisma.service';

/*
  An admin password reset hands back a temporary password — it IS signing in
  as the member. It was gated on `canManageUsers` alone, so a manager could
  reset the OWNER, read the temporary password off the response and take the
  organization. These pin the ceiling (security audit 2026-10-09).
*/
describe('adminResetMemberPassword — the takeover ceiling', () => {
  let service: UsersService;
  const ORG = 'org-1';

  const people: Record<string, any> = {
    owner: { id: 'owner', role: Role.ADMIN, organizationId: ORG, memberRole: null },
    admin2: { id: 'admin2', role: Role.ADMIN, organizationId: ORG, memberRole: null },
    manager: { id: 'manager', role: Role.EMPLOYEE, organizationId: ORG, canManageUsers: true, canViewAllTasks: true, memberRole: null },
    worker: { id: 'worker', role: Role.EMPLOYEE, organizationId: ORG, canViewAllTasks: true, memberRole: null },
    // Holds canAssignTasks through an ACTIVE org role — the ceiling must read the role, not only the flags.
    lead: { id: 'lead', role: Role.EMPLOYEE, organizationId: ORG, memberRole: { isActive: true, permissions: { canAssignTasks: true } } },
  };

  const prisma: Record<string, any> = {
    user: {
      findFirst: jest.fn(({ where }: any) => Promise.resolve(people[where.id] ?? null)),
      update: jest.fn(),
    },
    organization: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'owner' }) },
    refreshToken: { deleteMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
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

  const reset = (requester: string, member: string) => service.adminResetMemberPassword(member, ORG, requester);

  it('a manager cannot reset the owner', async () => {
    await expect(reset('manager', 'owner')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('another ADMIN cannot reset the owner either', async () => {
    await expect(reset('admin2', 'owner')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a manager cannot reset an admin', async () => {
    await expect(reset('manager', 'admin2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a manager cannot reset somebody whose org role grants more than they hold', async () => {
    await expect(reset('manager', 'lead')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a manager can reset somebody within their ceiling — and the old access tokens die', async () => {
    const r = await reset('manager', 'worker');
    expect(r.success).toBe(true);
    expect(typeof r.temporaryPassword).toBe('string');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'worker' },
      data: expect.objectContaining({ tokensValidAfter: expect.any(Date) }),
    }));
  });

  it('an admin can reset another admin', async () => {
    const r = await reset('owner', 'admin2');
    expect(r.success).toBe(true);
  });
});

/*
  Changing the sign-in EMAIL is the same takeover by another door: the new
  address receives the password reset link. Marking an admin external shuts
  them out of the organization's property. Both ask the reset's question.
*/
describe('updateMemberProfile — email and external follow the takeover ceiling', () => {
  let service: UsersService;
  const ORG = 'org-1';
  const people: Record<string, any> = {
    owner: { id: 'owner', email: 'owner@acme.at', role: Role.ADMIN, organizationId: ORG, memberRole: null, isExternal: false },
    manager: { id: 'manager', email: 'm@acme.at', role: Role.EMPLOYEE, organizationId: ORG, canManageUsers: true, canViewAllTasks: true, memberRole: null, isExternal: false },
    worker: { id: 'worker', email: 'w@acme.at', role: Role.EMPLOYEE, organizationId: ORG, canViewAllTasks: true, memberRole: null, isExternal: false },
  };
  const prisma: Record<string, any> = {
    user: {
      findFirst: jest.fn(({ where }: any) => Promise.resolve(where?.email ? null : people[where.id] ?? null)),
      update: jest.fn().mockResolvedValue({}),
    },
    organization: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'owner' }) },
    $transaction: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: SessionEvents, useValue: { sessionsRevoked: jest.fn(), organizationSuspended: jest.fn() } },
        { provide: 'TASK_SERVICE', useValue: { emit: jest.fn(), send: jest.fn() } },
        ...USERS_SERVICES,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it("a manager cannot change the owner's sign-in email", async () => {
    await expect(service.updateMemberProfile('owner', ORG, 'manager', { email: 'me@evil.test' } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('a manager cannot mark the owner external', async () => {
    await expect(service.updateMemberProfile('owner', ORG, 'manager', { isExternal: true } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it("a manager may still change a worker's email", async () => {
    await expect(service.updateMemberProfile('worker', ORG, 'manager', { email: 'new@acme.at' } as any))
      .resolves.not.toThrow();
  });
});
