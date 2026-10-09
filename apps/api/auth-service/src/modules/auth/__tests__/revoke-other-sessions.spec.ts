import { SessionEvents } from '../../../common/session-events/session-events.service';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { BillingService } from '../../billing/billing.service';
import { GraceTokenCache } from '../grace-token-cache.service';

/*
  "Sign out my other devices" keeps the caller's own session.

  The socket revocation event is per PERSON, so sending it would have closed the
  very screen the member pressed the button on. With a kept session it is not
  sent; without one (sign out everywhere), it is.
*/
describe('revokeAllSessions — keeping the caller’s session', () => {
  let service: AuthService;
  const sessions = { sessionsRevoked: jest.fn(), organizationSuspended: jest.fn() };
  const prisma: Record<string, any> = {
    refreshToken: { deleteMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    user: { update: jest.fn().mockResolvedValue({}) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: SessionEvents, useValue: sessions },
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: BillingService, useValue: { startTrial: jest.fn() } },
        { provide: GraceTokenCache, useValue: { get: jest.fn(), put: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('deletes every other session and keeps the named one', async () => {
    prisma.refreshToken.count.mockResolvedValue(1);
    await service.revokeAllSessions('u1', 'rt-mine');
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', id: { not: 'rt-mine' } } });
    expect(sessions.sessionsRevoked).not.toHaveBeenCalled();
  });

  it('a kept id that is not the caller’s keeps nothing — the event is sent', async () => {
    prisma.refreshToken.count.mockResolvedValue(0);
    await service.revokeAllSessions('u1', 'rt-someone-else');
    expect(sessions.sessionsRevoked).toHaveBeenCalledWith('u1');
  });

  it('signing out everywhere still tells every live connection', async () => {
    await service.revokeAllSessions('u1');
    expect(sessions.sessionsRevoked).toHaveBeenCalledWith('u1');
  });

  it('finds the caller’s own session from their refresh token, by hash and scoped to them', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue({ id: 'rt-mine' });
    prisma.refreshToken.count.mockResolvedValue(1);
    await service.revokeAllSessions('u1', undefined, 'raw-refresh-token');
    const lookup = prisma.refreshToken.findFirst.mock.calls[0][0];
    expect(lookup.where.userId).toBe('u1');
    expect(lookup.where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(lookup.where.tokenHash).not.toBe('raw-refresh-token');
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', id: { not: 'rt-mine' } } });
    expect(sessions.sessionsRevoked).not.toHaveBeenCalled();
  });
});
