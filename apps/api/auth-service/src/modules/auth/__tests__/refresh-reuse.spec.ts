import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { BillingService } from '../../billing/billing.service';
import { GraceTokenCache } from '../grace-token-cache.service';
import { Role, Platform } from '@hbcfield/shared';

/*
  ⚠️ A phone that lost its refresh response must not sign its member out of
  every device.

  The server rotates T1 → T2 and marks T1 used; the answer never arrives (a
  lift, a tunnel, a plant room); minutes later the phone presents T1 again.
  That used to revoke every session the member had. Offline mode makes this
  common, so the successor now decides: never used → end this chain only;
  used → two parties hold it, revoke everything as before.
*/
describe('refresh token presented again after the grace period', () => {
  let service: AuthService;
  const member = {
    id: 'user-1', email: 'mike@example.com', role: Role.EMPLOYEE, platform: Platform.MOBILE,
    organizationId: 'org-1', isActive: true, canViewAllTasks: false,
    organization: { id: 'org-1', suspendedAt: null }, memberRole: null, spaceAssignments: [],
  };
  const stale = {
    id: 'rt-1', userId: 'user-1', tokenHash: 'h1', replacedByTokenHash: 'h2',
    expiresAt: new Date(Date.now() + 30 * 86_400_000), usedAt: new Date(Date.now() - 10 * 60_000), user: member,
  };

  const prisma: Record<string, any> = {
    refreshToken: { findUnique: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 1 }), updateMany: jest.fn(), delete: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn(() => 'jwt'), verify: jest.fn(() => ({ sub: 'user-1' })) } },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'secret') } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: BillingService, useValue: { startTrial: jest.fn() } },
        { provide: GraceTokenCache, useValue: { get: jest.fn().mockResolvedValue(null), put: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('ends only this device when the successor was never used (a lost response)', async () => {
    prisma.refreshToken.findUnique.mockImplementation(async ({ where }: any) =>
      where.tokenHash === 'h2' ? { id: 'rt-2', usedAt: null } : stale,
    );
    const res: any = await service.refresh('T1');
    expect(res).toMatchObject({ success: false, statusCode: 401, code: 'SESSION_ENDED' });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['rt-1', 'rt-2'] } } });
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('revokes every session when the successor was already used (two holders)', async () => {
    prisma.refreshToken.findUnique.mockImplementation(async ({ where }: any) =>
      where.tokenHash === 'h2' ? { id: 'rt-2', usedAt: new Date() } : stale,
    );
    const res: any = await service.refresh('T1');
    expect(res).toMatchObject({ success: false, code: 'REFRESH_TOKEN_REUSED' });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('revokes every session when there is no successor to judge by', async () => {
    prisma.refreshToken.findUnique.mockImplementation(async ({ where }: any) =>
      where.tokenHash === 'h2' ? null : { ...stale, replacedByTokenHash: null },
    );
    const res: any = await service.refresh('T1');
    expect(res.code).toBe('REFRESH_TOKEN_REUSED');
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });
});
