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
import { Role, Platform, ORG_SUSPENDED_CODE, isOrganizationSuspended } from '@hbcfield/shared';

jest.mock('bcryptjs');

/*
  Deactivating an organization has to close every door, not the widest one.

  It used to close none of them: suspension mapped the org's subscription status
  to `canceled`, which refuses writes and allows reads — so a "suspended" company
  signed in as usual and read everything it had. These tests exist because the
  distance between the button's label and its effect is the whole bug, and it is
  the kind that comes back the moment someone refactors one of the three paths
  without knowing the other two exist.
*/
describe('a deactivated organization', () => {
  let service: AuthService;

  const suspendedOrg = {
    id: 'org-1', name: 'Off Ltd', suspendedAt: new Date('2026-09-05T09:00:00Z'),
    subStatus: 'ACTIVE', planTier: null, addOns: [], enabledModules: [],
    timezone: 'Europe/Vienna', profileBadges: null, usesExternalWorkers: false, ownerId: 'user-1',
  };

  const member = {
    id: 'user-1', email: 'member@off.example', passwordHash: 'hashed',
    firstName: 'Mia', lastName: 'Reiter', role: Role.ADMIN, platform: Platform.BOTH,
    organizationId: 'org-1', failedLoginAttempts: 0, lockedUntil: null, isActive: true,
    canCreateTasks: true, canViewAllTasks: true, canAssignTasks: true, canManageUsers: true,
    createdAt: new Date(), updatedAt: new Date(),
    organization: suspendedOrg, memberRole: null, spaceAssignments: [],
  };

  const prisma: Record<string, any> = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    organization: { create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(),
      update: jest.fn(), updateMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn((cb: (p: Record<string, any>) => any) => cb(prisma)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.refreshToken.findMany.mockResolvedValue([]);
    prisma.refreshToken.count.mockResolvedValue(0);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    // Enough of the happy path to reach a token: the control case has to be a
    // real successful login, or "it lets them back in" proves nothing.
    prisma.user.update.mockResolvedValue(member);
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-new' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn(() => 'jwt'), verify: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'secret') } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: BillingService, useValue: { startTrial: jest.fn() } },
        { provide: GraceTokenCache, useValue: { get: jest.fn().mockResolvedValue(null), put: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('refuses sign-in, and says why', async () => {
    prisma.user.findUnique.mockResolvedValue(member);

    const res: any = await service.login({ email: 'member@off.example', password: 'right-password' });

    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(HttpStatus.FORBIDDEN);
    expect(res.code).toBe(ORG_SUSPENDED_CODE);
  });

  it('refuses only AFTER the password, so it cannot be used to find members', async () => {
    /*
      A refusal that fires on a wrong password would answer "does this address
      belong to that company?" for anyone who can type an email — the same
      question the rest of login is careful never to answer.
    */
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    prisma.user.findUnique.mockResolvedValue(member);

    const res: any = await service.login({ email: 'member@off.example', password: 'wrong' });

    expect(res.code).toBeUndefined();
    expect(String(res.message)).toContain('Invalid email or password');
  });

  it('ends the session instead of quietly refusing it', async () => {
    // A refresh token still on the device is a session that has not ended: it
    // comes back every few minutes. Deleting it is what actually signs them out.
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1', userId: 'user-1', tokenHash: 'h', expiresAt: new Date(Date.now() + 86_400_000),
      usedAt: null, user: member,
    });

    const res: any = await service.refresh('some-token');

    expect(res.success).toBe(false);
    expect(res.code).toBe(ORG_SUSPENDED_CODE);
    expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-1' } });
  });

  it('stops the access token the member is already holding', async () => {
    /*
      The door that decides how fast the switch bites. Login and refresh alone
      would leave somebody mid-session working until their refresh fell due;
      this one takes effect within the gateway's auth cache TTL.
    */
    prisma.user.findUnique.mockResolvedValue(member);

    const res: any = await service.validateToken('access-token');

    expect(res.valid).toBe(false);
  });

  it('lets everyone back in the moment it is cleared', async () => {
    // Reversibility is the property that makes the switch usable at all.
    prisma.user.findUnique.mockResolvedValue({ ...member, organization: { ...suspendedOrg, suspendedAt: null } });

    const res: any = await service.login({ email: 'member@off.example', password: 'right-password' });

    expect(res.success).toBe(true);
  });
});

describe('isOrganizationSuspended', () => {
  it('treats a missing organization as not suspended', () => {
    // An orphan user — registered, no org yet — must still reach onboarding.
    expect(isOrganizationSuspended(null)).toBe(false);
    expect(isOrganizationSuspended(undefined)).toBe(false);
    expect(isOrganizationSuspended({ suspendedAt: null })).toBe(false);
  });

  it('reads a serialized timestamp too', () => {
    // The same organization arrives as a Date from Prisma and as a string over
    // the wire; one predicate has to answer for both.
    expect(isOrganizationSuspended({ suspendedAt: new Date() })).toBe(true);
    expect(isOrganizationSuspended({ suspendedAt: '2026-09-05T09:00:00Z' })).toBe(true);
  });
});
