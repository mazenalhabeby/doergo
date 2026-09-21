import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { BillingService } from '../../billing/billing.service';
import { GraceTokenCache } from '../grace-token-cache.service';

/*
  ⚠️ Signing out must stop the notifications to THAT phone.

  It used to be the phone's job, through a `DELETE /users/push-token/:token`
  issued AFTER the session had been torn down — best effort, and one failure
  (no signal at the moment of signing out, the app killed mid-logout) left the
  row on the server forever, because the phone clears its cached token either
  way and can never name it again. Members went on receiving their own
  notifications on a phone they had signed out of, and nothing on either side
  could stop it.

  Logout is the one request that is authenticated by definition at the moment
  it runs, so the removal belongs in it. The two things that must stay true:
  it is scoped to the member (the token column is unique, so an unscoped
  delete lets anyone holding a token string unregister someone else's phone),
  and it is scoped to the TOKEN (signing out of one phone must not silence the
  one still in their pocket).
*/
describe('signing out removes this device from push', () => {
  let service: AuthService;

  const stored = { userId: 'user-1', user: { organizationId: 'org-1' } };

  const prisma: Record<string, any> = {
    refreshToken: { findUnique: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    user: { update: jest.fn().mockResolvedValue({}) },
    userPushToken: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.refreshToken.findUnique.mockResolvedValue(stored);
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

  it('deletes the registration the phone named', async () => {
    await service.logout('T1', 'ExponentPushToken[abc]');
    expect(prisma.userPushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'ExponentPushToken[abc]', userId: 'user-1' },
    });
  });

  it('scopes it to the member, so a known token cannot unregister someone else', async () => {
    await service.logout('T1', 'ExponentPushToken[abc]');
    const [{ where }] = prisma.userPushToken.deleteMany.mock.calls[0];
    expect(where.userId).toBe('user-1');
  });

  it('never clears every token the member has — the other phone keeps working', async () => {
    await service.logout('T1', 'ExponentPushToken[abc]');
    const [{ where }] = prisma.userPushToken.deleteMany.mock.calls[0];
    expect(where.token).toBe('ExponentPushToken[abc]');
  });

  it('touches nothing when the phone sent no token (an older app)', async () => {
    await service.logout('T1');
    expect(prisma.userPushToken.deleteMany).not.toHaveBeenCalled();
  });

  it('still signs the member out when the push removal fails', async () => {
    prisma.userPushToken.deleteMany.mockRejectedValueOnce(new Error('db down'));
    const res: any = await service.logout('T1', 'ExponentPushToken[abc]');
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalled();
    expect(res).toMatchObject({ success: true, userId: 'user-1' });
  });
});
