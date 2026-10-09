import { SessionEvents } from '../../../common/session-events/session-events.service';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { BillingService } from '../../billing/billing.service';
import { GraceTokenCache } from '../grace-token-cache.service';
import { Role, Platform, MAX_FAILED_ATTEMPTS } from '@hbcfield/shared';

jest.mock('bcryptjs');

/*
  Sign-in, reset and session hardening (security audit 2026-10-09).

  - one answer for unknown / wrong / locked, and the same bcrypt cost for all;
  - a lock that expired starts the count again;
  - a reset link is CLAIMED atomically, and the reset kills access tokens;
  - an access token minted before the cut-off is refused;
  - no part of a refresh-token hash reaches the log.
*/
describe('sign-in hardening', () => {
  let service: AuthService;
  const jwt = { sign: jest.fn(() => 'jwt'), verify: jest.fn() };

  const member = {
    id: 'user-1', email: 'mia@example.com', passwordHash: 'hashed',
    firstName: 'Mia', lastName: 'Reiter', role: Role.EMPLOYEE, platform: Platform.BOTH,
    organizationId: 'org-1', failedLoginAttempts: 0, lockedUntil: null as Date | null, isActive: true,
    canCreateTasks: false, canViewAllTasks: false, canAssignTasks: false, canManageUsers: false,
    createdAt: new Date(), updatedAt: new Date(), tokensValidAfter: null as Date | null,
    organization: { id: 'org-1', name: 'Org', suspendedAt: null, subStatus: 'ACTIVE', planTier: null, addOns: [], enabledModules: [], timezone: 'Europe/Vienna', profileBadges: null, usesExternalWorkers: false, ownerId: 'owner' },
    memberRole: null, spaceAssignments: [],
  };

  const prisma: Record<string, any> = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    organization: { create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(),
      update: jest.fn(), updateMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    passwordResetToken: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    deviceKey: { updateMany: jest.fn() },
    spaceShare: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((cb: (p: Record<string, any>) => any) => cb(prisma)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.refreshToken.findMany.mockResolvedValue([]);
    prisma.user.update.mockResolvedValue(member);
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-new' });
    prisma.deviceKey.updateMany.mockResolvedValue({ count: 0 });
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: SessionEvents, useValue: { sessionsRevoked: jest.fn(), organizationSuspended: jest.fn() } },
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'secret') } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: BillingService, useValue: { startTrial: jest.fn() } },
        { provide: GraceTokenCache, useValue: { get: jest.fn().mockResolvedValue(null), put: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('one refusal for every failed sign-in', () => {
    const creds = { email: 'mia@example.com', password: 'whatever1' };

    it('an unknown address costs a bcrypt comparison and answers like a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const unknown: any = await service.login(creds);
      // Before: returned immediately, no bcrypt — a timing oracle.
      expect(bcrypt.compare).toHaveBeenCalledTimes(1);

      prisma.user.findUnique.mockResolvedValue({ ...member });
      const wrong: any = await service.login(creds);

      expect(unknown.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(wrong.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(unknown.message).toBe(wrong.message);
      // Before: "N attempt(s) remaining" — only a real account counts down.
      expect(wrong.message).not.toMatch(/remaining/i);
    });

    it('the attempt that locks the account answers the same 401 (it was a 429)', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...member, failedLoginAttempts: MAX_FAILED_ATTEMPTS - 1 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const r: any = await service.login(creds);
      expect(r.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(r.message).toBe('Invalid email or password');
    });

    it('a locked account answers the same 401 and still spends the bcrypt comparison', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...member, failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 60_000) });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const r: any = await service.login(creds);
      expect(r.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(r.message).toBe('Invalid email or password');
      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    });

    it('one wrong guess after an EXPIRED lock does not re-lock — the count restarts', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...member, failedLoginAttempts: 5, lockedUntil: new Date(Date.now() - 1000) });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await service.login(creds);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: member.id },
        data: { failedLoginAttempts: 1, lockedUntil: null },
      });
    });

    it('no part of the refresh-token hash is logged on a successful sign-in', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...member });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const log = jest.spyOn((service as any).logger, 'log');
      await service.login(creds);
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('NEW TOKEN CREATED'))).toBe(true);
      expect(lines.some((l) => /hash=/.test(l))).toBe(false);
    });
  });

  describe('password reset link', () => {
    const resetRow = { id: 'prt-1', used: false, expiresAt: new Date(Date.now() + 60_000), user: { ...member } };

    it('two requests with one link: the loser of the claim writes nothing', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRow);
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 }); // somebody else claimed it
      const r: any = await service.resetPassword({ token: 't', newPassword: 'NewPass123' });
      expect(r.success).toBe(false);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'prt-1', used: false }) }),
      );
    });

    it('the winner sets the password AND the session cut-off, and names the member for the gateway', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(resetRow);
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
      const r: any = await service.resetPassword({ token: 't', newPassword: 'NewPass123' });
      expect(r.success).toBe(true);
      expect(r.userId).toBe(member.id);
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tokensValidAfter: expect.any(Date) }),
      }));
    });
  });

  it('changing the password moves the session cut-off', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...member });
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await service.changePassword({ userId: member.id, currentPassword: 'OldPass123', newPassword: 'NewPass123' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tokensValidAfter: expect.any(Date) }),
    }));
  });

  describe('validateToken and the session cut-off', () => {
    const cutoff = new Date('2026-10-09T12:00:00Z');
    const cutoffSec = Math.floor(cutoff.getTime() / 1000);

    it('refuses an access token issued before the cut-off', async () => {
      jwt.verify.mockReturnValue({ sub: member.id, iat: cutoffSec - 60 });
      prisma.user.findUnique.mockResolvedValue({ ...member, tokensValidAfter: cutoff });
      const r: any = await service.validateToken('old');
      expect(r.valid).toBe(false);
    });

    it('accepts one issued after it, and keeps the cut-off off req.user', async () => {
      jwt.verify.mockReturnValue({ sub: member.id, iat: cutoffSec + 60 });
      prisma.user.findUnique.mockResolvedValue({ ...member, tokensValidAfter: cutoff });
      const r: any = await service.validateToken('new');
      expect(r.valid).toBe(true);
      expect(r.user).not.toHaveProperty('tokensValidAfter');
    });

    it('selects tokensValidAfter (an explicit select drops what it does not name)', async () => {
      jwt.verify.mockReturnValue({ sub: member.id, iat: cutoffSec });
      prisma.user.findUnique.mockResolvedValue(null);
      await service.validateToken('x');
      expect(prisma.user.findUnique.mock.calls[0][0].select.tokensValidAfter).toBe(true);
    });
  });
});
