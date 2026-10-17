import { createHmac } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PLATFORM_SESSION_MAX_SECONDS, platformEnrolmentRequired, platformLogoutCutoff, mayRefreshPlatformSession, isTeamColor } from '@hbcfield/shared';
import { platformAuthParts } from './platform-auth.service.fixture';
import { PlatformAuditService } from '../platform-audit.service';
import { PlatformSupportTeamsService } from '../platform-support-teams.service';
import { PlatformAdminService } from '../platform-admin.service';

jest.mock('bcryptjs');

/*
  Operator console hardening (2026-10-10):
  - 2FA can no longer be stripped by a bare `setup` call, and is mandatory;
  - sign-out is server-side, sessions slide but are capped;
  - an Owner cannot demote or deactivate themselves;
  - the operator audit trail is append-only;
  - the org list/detail send only what the console renders.
*/
const ACTIVE = 'JBSWY3DPEHPK3PXP';

function totp(secretB32: string, step = Math.floor(Date.now() / 30_000)): string {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretB32) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(step));
  const h = createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return (n % 1_000_000).toString().padStart(6, '0');
}

describe('platform 2FA + sessions', () => {
  const base = {
    id: 'op-1', email: 'op@example.com', passwordHash: 'h', role: 'OWNER', isActive: true, firstName: 'O', lastName: 'P',
    twoFactorEnabled: true, twoFactorSecret: ACTIVE, twoFactorPendingSecret: null as string | null, failedLoginAttempts: 0,
    lockedUntil: null, tokensValidAfter: null as Date | null,
  };
  let row: typeof base;
  const prisma: Record<string, any> = {
    platformUser: {
      findUnique: jest.fn(async () => ({ ...row })),
      update: jest.fn(async ({ data }: any) => (row = { ...row, ...data })),
      updateMany: jest.fn(async ({ data }: any) => { row = { ...row, ...data }; return { count: 1 }; }),
      count: jest.fn(async () => 2),
    },
    supportTeamMember: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const jwt = { sign: jest.fn(() => 'fresh-token'), verify: jest.fn() };
  const svc = platformAuthParts(prisma as any, jwt as any, { get: () => 'secret' } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    row = { ...base };
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  it('setup while 2FA is ON needs a current code — no code, no change', async () => {
    const r: any = await svc.setup2fa({ userId: 'op-1' });
    expect(r.success).toBe(false);
    expect(r.code).toBe('PLATFORM_2FA_CODE_REQUIRED');
    expect(prisma.platformUser.update).not.toHaveBeenCalled();
    expect(row.twoFactorEnabled).toBe(true);
  });

  it('setup with a valid code stores a PENDING secret; the active factor is untouched', async () => {
    const r: any = await svc.setup2fa({ userId: 'op-1', code: totp(ACTIVE) });
    expect(r.success).toBe(true);
    expect(row.twoFactorEnabled).toBe(true);
    expect(row.twoFactorSecret).toBe(ACTIVE);
    expect(row.twoFactorPendingSecret).toBe(r.data.secret);
    // Other sessions end; the caller gets a fresh token.
    expect(row.tokensValidAfter).toBeInstanceOf(Date);
    expect(r.data.token).toBe('fresh-token');
  });

  it('enable verifies a code from the PENDING secret and swaps it in', async () => {
    row = { ...row, twoFactorEnabled: false, twoFactorSecret: null as any, twoFactorPendingSecret: 'GEZDGNBVGY3TQOJQ' };
    expect(((await svc.enable2fa({ userId: 'op-1', code: '000000' })) as any).success).toBe(false);
    const r: any = await svc.enable2fa({ userId: 'op-1', code: totp('GEZDGNBVGY3TQOJQ') });
    expect(r.success).toBe(true);
    expect(row).toMatchObject({ twoFactorEnabled: true, twoFactorSecret: 'GEZDGNBVGY3TQOJQ', twoFactorPendingSecret: null });
    expect(r.data.user.enrolmentRequired).toBe(false);
    expect(prisma.platformUser.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'op-1', twoFactorPendingSecret: 'GEZDGNBVGY3TQOJQ' },
    }));
  });

  it('disable needs a code and ends other sessions', async () => {
    prisma.platformUser.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(((await svc.disable2fa({ userId: 'op-1', code: totp(ACTIVE) })) as any).success).toBe(false); // step already used
    const r: any = await svc.disable2fa({ userId: 'op-1', code: totp(ACTIVE) });
    expect(r.success).toBe(true);
    expect(row.twoFactorEnabled).toBe(false);
    expect(row.tokensValidAfter).toBeInstanceOf(Date);
  });

  it('2FA is mandatory: an unenrolled operator signs in to an enrolment-only session', async () => {
    row = { ...row, twoFactorEnabled: false, twoFactorSecret: null as any };
    const r: any = await svc.login({ email: 'op@example.com', password: 'pw' });
    expect(r.success).toBe(true);
    expect(r.data.user.enrolmentRequired).toBe(true);
    expect(platformEnrolmentRequired({ role: 'SUPPORT', twoFactorEnabled: false })).toBe(true);
    expect(platformEnrolmentRequired({ role: 'BILLING', twoFactorEnabled: true })).toBe(false);
  });

  it('sign-out moves the cut-off past the signing-out token', async () => {
    const iat = Math.floor(Date.now() / 1000);
    await svc.logout({ userId: 'op-1', iat });
    expect(row.tokensValidAfter!.getTime()).toBeGreaterThanOrEqual((iat + 1) * 1000);
    expect(platformLogoutCutoff(100, 50_000).getTime()).toBe(101_000);
  });

  it('a refresh carries auth_time forward and refuses a chain past the cap', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(((await svc.refresh({ userId: 'op-1', authTime: now - 60 })) as any).success).toBe(true);
    expect(jwt.sign).toHaveBeenLastCalledWith(expect.objectContaining({ auth_time: now - 60 }), expect.anything());
    expect(((await svc.refresh({ userId: 'op-1', authTime: now - PLATFORM_SESSION_MAX_SECONDS - 1 })) as any).statusCode).toBe(401);
    expect(mayRefreshPlatformSession(undefined)).toBe(false);
  });

  it('an Owner cannot demote or deactivate themselves', async () => {
    expect(((await svc.updateUser({ id: 'op-1', role: 'SUPPORT', byUserId: 'op-1' })) as any).statusCode).toBe(403);
    expect(((await svc.updateUser({ id: 'op-1', isActive: false, byUserId: 'op-1' })) as any).statusCode).toBe(403);
    expect(row.role).toBe('OWNER');
    // ...another Owner can, and the target's sessions end.
    expect(((await svc.updateUser({ id: 'op-1', role: 'SUPPORT', byUserId: 'op-2' })) as any).success).toBe(true);
    expect(row.tokensValidAfter).toBeInstanceOf(Date);
  });

  it('an Owner resets somebody else\'s 2FA, never their own', async () => {
    expect(((await svc.reset2fa({ id: 'op-1', byUserId: 'op-1' })) as any).success).toBe(false);
    expect(((await svc.reset2fa({ id: 'op-1', byUserId: 'op-2' })) as any).success).toBe(true);
    expect(row.twoFactorEnabled).toBe(false);
  });

  it('validateToken reports this token\'s iat and auth_time', async () => {
    jwt.verify.mockReturnValue({ sub: 'op-1', typ: 'platform', iat: 1000, auth_time: 900 });
    const v: any = await svc.validateToken('t');
    expect(v.session).toEqual({ iat: 1000, authTime: 900 });
  });
});

describe('operator audit trail', () => {
  it('has a write and a list — and no way to change or remove a row', () => {
    const methods = Object.getOwnPropertyNames(PlatformAuditService.prototype).filter((m) => m !== 'constructor');
    expect(methods.sort()).toEqual(['list', 'write']);
  });

  it('writes a sanitised row; an unknown actor type is ANONYMOUS and never carries an id', async () => {
    const create = jest.fn().mockResolvedValue({});
    const svc = new PlatformAuditService({ platformAuditLog: { create } } as any);
    await svc.write({ actorType: 'ROOT', actorId: 'x', method: 'POST', route: '/platform/orgs/:id/suspend', action: 'ORG_SUSPENDED', ok: true });
    expect(create.mock.calls[0][0].data).toMatchObject({ actorType: 'ANONYMOUS', actorId: null, action: 'ORG_SUSPENDED', ok: true });
  });

  it('lists newest first with a cursor and the organization names', async () => {
    const rows = [{ id: 'a', targetOrganizationId: 'o1' }, { id: 'b', targetOrganizationId: null }, { id: 'c', targetOrganizationId: null }];
    const prisma = {
      platformAuditLog: { findMany: jest.fn().mockResolvedValue(rows) },
      organization: { findMany: jest.fn().mockResolvedValue([{ id: 'o1', name: 'Acme' }]) },
    };
    const r: any = await new PlatformAuditService(prisma as any).list({ limit: 2 });
    expect(r.data).toHaveLength(2);
    expect(r.data[0].targetOrganizationName).toBe('Acme');
    expect(r.nextCursor).toBe('b');
  });
});

describe('support team colour', () => {
  const prisma = { supportTeam: { create: jest.fn(async ({ data }: any) => data), update: jest.fn(async ({ data }: any) => data) } };
  const svc = new PlatformSupportTeamsService(prisma as any);

  it('only #rrggbb is stored', async () => {
    expect(isTeamColor('#a1b2c3')).toBe(true);
    expect(((await svc.createTeam({ name: 'EU', color: 'red;background:url(x)' })) as any).success).toBe(false);
    expect(((await svc.updateTeam({ teamId: 't', color: 'javascript:1' })) as any).success).toBe(false);
    expect(((await svc.updateTeam({ teamId: 't', color: '#00ff00' })) as any).success).toBe(true);
    expect(((await svc.updateTeam({ teamId: 't', color: null })) as any).success).toBe(true);
  });
});

describe('org list + detail send only what the console renders', () => {
  const org = {
    id: 'o1', name: 'Acme', planTier: null, subStatus: 'ACTIVE', trialEndsAt: null, suspendedAt: null, createdAt: new Date(),
    addOns: [], billingMode: 'INVOICE', invoiceDueDays: 14, agreedMonthlyCents: null, agreedListCents: null,
    agreedUntil: null, agreedNote: null, agreedSetAt: null, subscription: { lastBilledCents: 1000 },
    stripeCustomerId: 'cus_secret', vatId: 'ATU123', billingEmail: 'pay@acme.test', email: null,
    enabledModules: [], currentPeriodEnd: null, billingInterval: 'MONTHLY',
  };
  const prisma: any = {
    organization: { findMany: jest.fn().mockResolvedValue([org, { ...org, id: 'o2' }]), findUnique: jest.fn().mockResolvedValue(org) },
    user: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn(async ({ select }: any) => [{ id: 'u', firstName: 'A', lastName: 'B', role: 'ADMIN', isActive: true, ...(select.email ? { email: 'a@acme.test' } : {}) }]),
      count: jest.fn().mockResolvedValue(250),
    },
  };
  const bill = { compute: jest.fn().mockResolvedValue({ listMonthlyCents: 5000 }) };
  const svc = new PlatformAdminService(prisma, {} as any, undefined, bill as any, {} as any);

  it('the list pages with a cursor and carries no Stripe id or VAT number', async () => {
    const r: any = await svc.listOrgs({ limit: 1 });
    expect(r.data).toHaveLength(1);
    expect(r.nextCursor).toBe('o1');
    expect(r.data[0]).not.toHaveProperty('stripeCustomerId');
    expect(r.data[0]).not.toHaveProperty('vatId');
    expect(r.data[0].mrrCents).toBe(1000);
  });

  it('a SUPPORT reader sees members without their emails; members are capped with a total', async () => {
    const r: any = await svc.orgDetail('o1', { viewerRole: 'SUPPORT' });
    expect(r.data.members[0].email).toBeNull();
    expect(prisma.user.findMany.mock.calls.at(-1)[0].select.email).toBe(false);
    expect(prisma.user.findMany.mock.calls.at(-1)[0].take).toBe(100);
    expect(r.data.memberTotal).toBe(250);
    expect(r.data).not.toHaveProperty('vatId');
    expect(r.data).not.toHaveProperty('billingEmail');
    expect(r.data.hasBillingEmail).toBe(true);
    const owner: any = await svc.orgDetail('o1', { viewerRole: 'OWNER' });
    expect(owner.data.members[0].email).toBe('a@acme.test');
  });
});
