import { SessionEvents } from '../../../common/session-events/session-events.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@hbcfield/shared';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Member corrections from the 2026-10-09 audit.
 *
 *   coordinates leave only with canViewTracking — the roster keeps "last seen"
 *   the flat permission columns obey the granter's ceiling
 *   switching somebody off in the edit form signs them out, like deactivate
 */
describe('users — audit corrections 2026-10-09', () => {
  let service: UsersService;
  const sessions = { sessionsRevoked: jest.fn(), organizationSuspended: jest.fn() };

  const prisma: Record<string, any> = {
    user: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    refreshToken: { deleteMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: SessionEvents, useValue: sessions },
        { provide: 'TASK_SERVICE', useValue: { emit: jest.fn() } },
        UsersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  describe('GET /users/workers', () => {
    const seen = new Date('2026-10-09T08:00:00Z');
    beforeEach(() =>
      prisma.user.findMany.mockResolvedValue([
        { id: 'w1', lastLocation: { lat: 47.9, lng: 13.8, accuracy: 5, updatedAt: seen } },
        { id: 'w2', lastLocation: null },
      ]),
    );

    it('withholds coordinates by default, keeping when they were last seen', async () => {
      const r: any = await service.getWorkers('org-1');
      expect(r.data[0].lastLocation).toEqual({ updatedAt: seen });
      expect(r.data[1].lastLocation).toBeNull();
    });

    it('returns them to a caller holding canViewTracking', async () => {
      const r: any = await service.getWorkers('org-1', true);
      expect(r.data[0].lastLocation.lat).toBe(47.9);
    });
  });

  describe('flat permission columns are capped by the granter', () => {
    const check = (data: Record<string, unknown>) =>
      (service as any).assertFlatPermsWithinCeiling('req', 'org-1', data);

    it('refuses granting canViewAllTasks the requester does not hold', async () => {
      prisma.user.findFirst.mockResolvedValue({ role: Role.EMPLOYEE, canManageUsers: true, memberRole: null });
      await expect(check({ canViewAllTasks: true })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an org-wide task-creation scope wider than their own', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce({ role: Role.EMPLOYEE, canManageUsers: true, canCreateTasks: true, memberRole: null })
        .mockResolvedValueOnce({ taskCreationScope: 'SELF' });
      await expect(check({ canCreateTasks: true, taskCreationScope: 'ORG' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows what they hold, and any switch turned OFF', async () => {
      prisma.user.findFirst.mockResolvedValue({ role: Role.EMPLOYEE, canViewAllTasks: true, memberRole: null });
      await expect(check({ canViewAllTasks: true, canAssignTasks: false, canViewReports: false })).resolves.toBeUndefined();
    });

    it('never asks about the default SELF scope a role change writes', async () => {
      await expect(check({ canCreateTasks: false, taskCreationScope: 'SELF' })).resolves.toBeUndefined();
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('lets an admin grant anything', async () => {
      prisma.user.findFirst.mockResolvedValue({ role: Role.ADMIN, memberRole: null });
      await expect(check({ canViewAllTasks: true, taskCreationScope: 'ORG' })).resolves.toBeUndefined();
    });
  });

  describe('isActive:false through the edit form', () => {
    beforeEach(() => {
      prisma.user.findFirst.mockResolvedValue({ id: 'emp', organizationId: 'org-1', role: Role.EMPLOYEE });
      prisma.user.update.mockResolvedValue({ id: 'emp' });
    });

    it('signs them out — cut-off, refresh tokens, live sessions', async () => {
      await service.updateEmployee('emp', 'org-1', { isActive: false } as never);
      expect(prisma.user.update.mock.calls[0][0].data.tokensValidAfter).toBeInstanceOf(Date);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'emp' } });
      expect(sessions.sessionsRevoked).toHaveBeenCalledWith('emp');
    });

    it('leaves an ordinary edit alone', async () => {
      await service.updateEmployee('emp', 'org-1', { firstName: 'Mike' } as never);
      expect(prisma.user.update.mock.calls[0][0].data.tokensValidAfter).toBeUndefined();
      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
      expect(sessions.sessionsRevoked).not.toHaveBeenCalled();
    });
  });
});
