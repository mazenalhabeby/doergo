import { createHmac } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PlatformAuthService } from '../platform-auth.service';
import { matchTotpStep } from '../totp.util';

jest.mock('bcryptjs');

/*
  Operator console (security audit 2026-10-09):
  - a TOTP code is accepted ONCE — the step is claimed with a conditional update;
  - an operator token issued before their password changed is refused.
*/
const SECRET_B32 = 'JBSWY3DPEHPK3PXP';

function codeAt(stepNumber: number): string {
  // Independent RFC 6238 implementation, so the test does not trust the code under test.
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of SECRET_B32) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(stepNumber));
  const h = createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return (n % 1_000_000).toString().padStart(6, '0');
}

describe('operator console sessions', () => {
  const operator = {
    id: 'op-1', email: 'op@example.com', passwordHash: 'h', role: 'OWNER', isActive: true,
    twoFactorEnabled: true, twoFactorSecret: SECRET_B32, failedLoginAttempts: 0, lockedUntil: null,
    tokensValidAfter: null as Date | null,
  };
  const prisma: Record<string, any> = {
    platformUser: { findUnique: jest.fn(), update: jest.fn(async ({ data }: any) => ({ ...operator, ...data })), updateMany: jest.fn() },
    supportTeamMember: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const jwt = { sign: jest.fn(() => 'op-token'), verify: jest.fn() };
  const service = new PlatformAuthService(prisma as any, jwt as any, { get: () => 'secret' } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.platformUser.findUnique.mockResolvedValue({ ...operator });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  it('matchTotpStep returns the matched step', () => {
    const step = Math.floor(Date.now() / 30_000);
    expect(matchTotpStep(SECRET_B32, codeAt(step))).toBe(step);
    expect(matchTotpStep(SECRET_B32, '000000'.replace(/./g, (_, i) => String((Number(codeAt(step)[i]) + 1) % 10)))).toBeNull();
  });

  it('a replayed code is refused — the step claim finds nothing newer to write', async () => {
    const code = codeAt(Math.floor(Date.now() / 30_000));
    prisma.platformUser.updateMany.mockResolvedValueOnce({ count: 1 });
    const first: any = await service.login({ email: operator.email, password: 'pw', code });
    expect(first.success).toBe(true);

    prisma.platformUser.updateMany.mockResolvedValueOnce({ count: 0 }); // step already used
    const replay: any = await service.login({ email: operator.email, password: 'pw', code });
    expect(replay.success).toBe(false);
    expect(prisma.platformUser.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: operator.id }),
      data: { twoFactorLastStep: expect.any(Number) },
    }));
  });

  it('a password change moves the cut-off, and older operator tokens are refused', async () => {
    await service.changePassword({ userId: operator.id, currentPassword: 'old', newPassword: 'a-new-password' });
    expect(prisma.platformUser.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tokensValidAfter: expect.any(Date) }),
    }));

    const cutoff = new Date();
    prisma.platformUser.findUnique.mockResolvedValue({ ...operator, tokensValidAfter: cutoff });
    jwt.verify.mockReturnValue({ sub: operator.id, typ: 'platform', iat: Math.floor(cutoff.getTime() / 1000) - 10 });
    expect((await service.validateToken('old')).valid).toBe(false);

    jwt.verify.mockReturnValue({ sub: operator.id, typ: 'platform', iat: Math.floor(cutoff.getTime() / 1000) + 10 });
    expect((await service.validateToken('new')).valid).toBe(true);
  });
});
