import { SessionEvents } from '../../../common/session-events/session-events.service';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import { AUTH_SERVICES } from '../auth-services';
import { PrismaService } from '@hbcfield/shared';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { BillingService } from '../../billing/billing.service';
import { BillingTrialService } from '../../billing/billing-trial.service';
import { GraceTokenCache } from '../grace-token-cache.service';
import { Role, Platform } from '@hbcfield/shared';

jest.mock('bcryptjs');

/*
  The offline-mode switch, read off the session each door actually RETURNS.

  `offline-mode-context.spec` reads the source as text; this one runs the code,
  so a formatter or an unusual way of writing a line cannot fool it. A path that
  forgets the field answers `undefined` and fails here — on that path a member
  whose app signed in, refreshed or re-validated would silently lose offline mode.
*/
describe('offlineMode on every session a member can hold', () => {
  let service: AuthService;

  const orgWith = (offlineMode: boolean) => ({
    id: 'org-1',
    name: 'Field Ltd',
    suspendedAt: null,
    subStatus: 'ACTIVE',
    planTier: null,
    addOns: [],
    enabledModules: [],
    currency: 'EUR',
    offlineMode,
    timezone: 'Europe/Vienna',
    profileBadges: null,
    usesExternalWorkers: false,
    ownerId: 'user-1',
  });

  const memberIn = (offlineMode: boolean) => ({
    id: 'user-1',
    email: 'member@field.example',
    passwordHash: 'hashed',
    firstName: 'Mia',
    lastName: 'Reiter',
    role: Role.ADMIN,
    platform: Platform.BOTH,
    organizationId: 'org-1',
    failedLoginAttempts: 0,
    lockedUntil: null,
    isActive: true,
    onboardingCompleted: true,
    tokensValidAfter: null,
    canCreateTasks: true,
    canViewAllTasks: true,
    canAssignTasks: true,
    canManageUsers: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: orgWith(offlineMode),
    memberRole: null,
    spaceAssignments: [],
  });

  const prisma: Record<string, any> = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    organization: { create: jest.fn(), findUnique: jest.fn() },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
    spaceShare: { findMany: jest.fn() },
    approvalDelegation: { findMany: jest.fn(), findFirst: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((cb: (p: Record<string, any>) => any) => cb(prisma)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.refreshToken.findMany.mockResolvedValue([]);
    prisma.refreshToken.count.mockResolvedValue(0);
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt-new' });
    prisma.spaceAssignment.findMany.mockResolvedValue([]);
    prisma.companyLocation.findMany.mockResolvedValue([]);
    prisma.spaceShare.findMany.mockResolvedValue([]);
    prisma.approvalDelegation.findMany.mockResolvedValue([]);
    prisma.approvalDelegation.findFirst.mockResolvedValue(null);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const module = await Test.createTestingModule({
      providers: [
        { provide: SessionEvents, useValue: { sessionsRevoked: jest.fn(), organizationSuspended: jest.fn() } },
        ...AUTH_SERVICES,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(() => 'jwt'), verify: jest.fn(() => ({ sub: 'user-1', iat: 0 })) },
        },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'secret') } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: BillingService, useValue: { startTrial: jest.fn() } },
        { provide: BillingTrialService, useValue: { startTrial: jest.fn() } },
        { provide: GraceTokenCache, useValue: { get: jest.fn().mockResolvedValue(null), put: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  const signIn = async (on: boolean) => {
    const member = memberIn(on);
    prisma.user.findUnique.mockResolvedValue(member);
    prisma.user.update.mockResolvedValue(member);
    const res: any = await service.login({ email: member.email, password: 'right-password' });
    expect(res.success).toBe(true);
    return res.data.user;
  };

  const refresh = async (on: boolean) => {
    const member = memberIn(on);
    prisma.user.findUnique.mockResolvedValue(member);
    prisma.user.update.mockResolvedValue(member);
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: 'h',
      expiresAt: new Date(Date.now() + 86_400_000),
      usedAt: null,
      replacedByTokenHash: null,
      cachedAccessToken: null,
      cachedRefreshToken: null,
      user: member,
    });
    prisma.refreshToken.update.mockResolvedValue({});
    const res: any = await service.refresh('some-token');
    expect(res.success).toBe(true);
    return res.data.user;
  };

  const validate = async (on: boolean) => {
    prisma.user.findUnique.mockResolvedValue(memberIn(on));
    // The "last active" heartbeat is fire-and-forget: it must answer a promise.
    prisma.user.update.mockResolvedValue({});
    prisma.organization.findUnique.mockResolvedValue(orgWith(on));
    const res: any = await service.validateToken('access-token');
    expect(res.valid).toBe(true);
    return res.user;
  };

  it.each([
    ['sign-in', signIn],
    ['refresh', refresh],
    ['token validation', validate],
  ])('%s carries the organization’s switch, on and off', async (_door, open) => {
    expect((await open(true)).offlineMode).toBe(true);
    expect((await open(false)).offlineMode).toBe(false);
  });

  it.each([
    ['sign-in', signIn],
    ['refresh', refresh],
    ['token validation', validate],
  ])('%s carries orgAddOns beside it', async (_door, open) => {
    expect((await open(true)).orgAddOns).toEqual([]);
  });
});
