import { PushService } from '../push.service';

/*
  Every push names who it was for — the phone refuses a notification button
  (answer an invite, "I'm with him") when somebody else has signed in since.
*/
describe('push recipient', () => {
  it('each message carries the recipient id of its own device', async () => {
    const svc: any = Object.create(PushService.prototype);
    svc.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const sent: any[] = [];
    svc.expo = {
      chunkPushNotifications: (m: any[]) => [m],
      sendPushNotificationsAsync: async (chunk: any[]) => { sent.push(...chunk); return chunk.map(() => ({ status: 'ok', id: 'x' })); },
    };
    svc.prisma = { userPushToken: { deleteMany: jest.fn() } };
    await svc.deliver(
      [{ token: 'ExponentPushToken[a]', userId: 'u-a' }, { token: 'ExponentPushToken[b]', userId: 'u-b' }],
      'Title', 'Body', { type: 'calendar_reminder', eventId: 'e1' },
    );
    expect(sent.map((m) => m.data)).toEqual([
      { type: 'calendar_reminder', eventId: 'e1', recipientId: 'u-a' },
      { type: 'calendar_reminder', eventId: 'e1', recipientId: 'u-b' },
    ]);
  });
});
