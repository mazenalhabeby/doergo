import { MemberFactsService } from '../member-facts.service';

describe('MemberFactsService — the User columns other services learn', () => {
  const prisma: any = {
    user: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([{ id: 'u1', presence: 'BUSY' }]),
    },
  };
  const facts = new MemberFactsService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('writes only the language column, and only a supported language', async () => {
    expect((await facts.setLocale({ userId: 'u1', locale: 'de-AT' })).success).toBe(true);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { locale: 'de' } });
    expect((await facts.setLocale({ userId: 'u1', locale: 'xx' })).success).toBe(false);
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
  });

  it('refuses a consent time that is not a time', async () => {
    expect((await facts.setAutoClockConsent({ userId: 'u1', consentAt: 'soon' })).success).toBe(false);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    await facts.setAutoClockConsent({ userId: 'u1', consentAt: null });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { autoClockConsentAt: null } });
  });

  it('marks active in one write and answers presence only when asked', async () => {
    expect(await facts.markActive({ userIds: ['u1', 'u1', ''] })).toEqual({ success: true });
    expect(prisma.user.updateMany.mock.calls[0][0].where).toEqual({ id: { in: ['u1'] } });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect((await facts.markActive({ userIds: ['u1'], withPresence: true })).presence).toEqual({ u1: 'BUSY' });
  });

  it('marking inactive clears last-active and nothing else', async () => {
    await facts.markInactive({ userId: 'u1' });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { lastActiveAt: null } });
  });
});
