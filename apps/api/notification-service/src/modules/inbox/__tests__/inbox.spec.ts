import { InboxService } from '../inbox.service';

describe('InboxService — a member reads and marks only their own notifications', () => {
  const prisma: any = {
    notificationDelivery: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  };
  const inbox = new InboxService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('lists the caller’s in-app rows, at most 100', async () => {
    await inbox.list('u1', 5000);
    expect(prisma.notificationDelivery.findMany.mock.calls[0][0]).toMatchObject({
      where: { recipientId: 'u1', channel: 'SOCKET' },
      take: 100,
    });
  });

  it('marks given ids read only when they are the caller’s', async () => {
    await inbox.markRead('u1', ['n1', 'n2']);
    expect(prisma.notificationDelivery.updateMany.mock.calls[0][0].where).toEqual({
      recipientId: 'u1',
      readAt: null,
      id: { in: ['n1', 'n2'] },
    });
  });
});
