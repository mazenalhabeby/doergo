import { SessionEvents } from '../../../common/session-events/session-events.service';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { SessionControlService } from '../session-control.service';
import { combinedServices } from '../../../common/testing/combined-services';
import { AUTH_SERVICES } from '../auth-services';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { BillingService } from '../../billing/billing.service';
import { BillingTrialService } from '../../billing/billing-trial.service';
import { GraceTokenCache } from '../grace-token-cache.service';
import { of, throwError } from 'rxjs';

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

  notification-service owns the push tokens (docs/data-ownership.md, group F), so
  sign-out ASKS it (`remove_push_token` with the member's id) and waits for the answer.
*/
describe('signing out removes this device from push', () => {
  let service: AuthService &
    Pick<SessionControlService, 'logout' | 'listSessions' | 'revokeSession' | 'revokeAllSessions'>;

  const stored = { userId: 'user-1', user: { organizationId: 'org-1' } };

  const prisma: Record<string, any> = {
    refreshToken: { findUnique: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    user: { update: jest.fn().mockResolvedValue({}) },
  };
  const events = { sessionsRevoked: jest.fn(), organizationSuspended: jest.fn(), signedOutDevice: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    events.signedOutDevice.mockResolvedValue(undefined);
    prisma.refreshToken.findUnique.mockResolvedValue(stored);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: SessionEvents, useValue: events },
        ...AUTH_SERVICES,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn(() => 'jwt'), verify: jest.fn(() => ({ sub: 'user-1' })) } },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'secret') } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: BillingService, useValue: { startTrial: jest.fn() } },
        { provide: BillingTrialService, useValue: { startTrial: jest.fn() } },
        { provide: GraceTokenCache, useValue: { get: jest.fn().mockResolvedValue(null), put: jest.fn() } },
      ],
    }).compile();
    // Signing out and sessions are SessionControlService since the split; one object over both.
    service = combinedServices(module.get(AuthService), module.get(SessionControlService)) as any;
  });

  it('asks for the registration the phone named, for THIS member only', async () => {
    await service.logout('T1', 'ExponentPushToken[abc]');
    expect(events.signedOutDevice).toHaveBeenCalledWith('user-1', 'ExponentPushToken[abc]');
  });

  /*
    ⚠️ The real-world bug (2026-09-15 → 2026-10-11): the phone stored its
    registration as `token|language` and sent THAT as the token. The server
    stores the bare token, so the delete matched nothing and every signed-out
    phone kept receiving the member's notifications.
  */
  it('asks for the bare token when the phone sends `token|language` (apps before the fix)', async () => {
    await service.logout('T1', 'ExponentPushToken[abc]|de');
    expect(events.signedOutDevice).toHaveBeenCalledWith('user-1', 'ExponentPushToken[abc]');
  });

  it('asks nothing when the phone sent no token (an older app)', async () => {
    await service.logout('T1');
    expect(events.signedOutDevice).not.toHaveBeenCalled();
  });
});

describe('SessionEvents.signedOutDevice — the message to notification-service', () => {
  it('sends remove_push_token scoped to the member and the one token — never every token', async () => {
    const client: any = { send: jest.fn(() => of({ success: true })) };
    await new SessionEvents(client).signedOutDevice('user-1', 'ExponentPushToken[abc]');
    expect(client.send).toHaveBeenCalledWith(
      { cmd: 'remove_push_token' },
      { token: 'ExponentPushToken[abc]', userId: 'user-1' },
    );
  });

  it('never fails the sign-out when notification-service cannot answer', async () => {
    const client: any = { send: jest.fn(() => throwError(() => new Error('down'))) };
    await expect(new SessionEvents(client).signedOutDevice('user-1', 'tok')).resolves.toBeUndefined();
  });
});
