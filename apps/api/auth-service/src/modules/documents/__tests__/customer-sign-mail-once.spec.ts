import { CustomerSignMailerService } from '../signing/customer-sign-mailer.service';

/*
  A client is emailed ONCE when it becomes their turn, reminded after 3 and 7
  days, and then left alone. The sweep used to re-send every five minutes and
  mint a fresh token each time — killing the link the client was about to use.

  A still-valid link is never rotated here: only its hash is kept, so a later
  email points back at the earlier one and offers the "ask for a new link"
  page. A link is minted only when there is none, it has expired, or it was
  never delivered.
*/
describe('client signing email — once per turn, no token rotation', () => {
  const ORG = 'org-1';
  const NOW = new Date('2026-10-10T09:00:00Z');
  const DAY = 24 * 60 * 60 * 1000;

  function setup(opts: {
    step?: { linkMailedAt: Date | null; linkReminders: number };
    link?: { lastSentAt: Date | null; expiresAt: Date } | null;
  }) {
    const step = opts.step ?? { linkMailedAt: null, linkReminders: 0 };
    const prisma: any = {
      user: { findMany: jest.fn(async () => []) },
      organization: { findUnique: jest.fn(async () => ({ country: null, customers: [] })) },
      customerSignLink: {
        // No link yet: the first read finds none, the read after minting finds the new row.
        findUnique: opts.link
          ? jest.fn(async () => ({ id: 'L1', ...opts.link }))
          : jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: 'L1' }),
      },
      documentSigner: {
        updateMany: jest.fn(),
        findMany: jest.fn(async () => [
          {
            id: 's1',
            order: 2,
            customerId: 'c1',
            ...step,
            document: {
              title: 'Time sheet September',
              user: { firstName: 'Mira', lastName: 'K' },
              organization: { name: 'Acme' },
              signers: [
                { order: 1, status: 'SIGNED' },
                { order: 2, status: 'PENDING' },
              ],
            },
          },
        ]),
      },
    };
    const links = {
      mintFor: jest.fn(async () => ({ token: 'fresh-token-123456789', expiresAt: new Date(NOW.getTime() + 14 * DAY) })),
      markSent: jest.fn(),
    };
    const service = new CustomerSignMailerService(prisma, { get: jest.fn(() => undefined) } as any, links as any);
    const send = jest.spyOn(service as any, 'send').mockResolvedValue(true);
    return { service, prisma, links, send };
  }

  it('first email of a turn with no link: mints, sends the link, records the step', async () => {
    const { service, prisma, links, send } = setup({ link: null });
    expect(await service.sendPending(ORG, 'client@firma.at', NOW)).toBe(true);
    expect(links.mintFor).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0][1] as any).html).toContain('/sign?token=fresh-token-123456789');
    expect(prisma.documentSigner.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1'] }, linkMailedAt: null },
      data: { linkMailedAt: NOW },
    });
    expect(links.markSent).toHaveBeenCalledWith('L1');
  });

  it('sends nothing again minutes later — the step was already mailed', async () => {
    const { service, links, send } = setup({
      step: { linkMailedAt: new Date(NOW.getTime() - 5 * 60 * 1000), linkReminders: 0 },
      link: { lastSentAt: new Date(NOW.getTime() - 5 * 60 * 1000), expiresAt: new Date(NOW.getTime() + 13 * DAY) },
    });
    expect(await service.sendPending(ORG, 'client@firma.at', NOW)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(links.mintFor).not.toHaveBeenCalled();
  });

  it('a 3-day reminder while the link still works does NOT rotate it', async () => {
    const mailed = new Date(NOW.getTime() - 3 * DAY);
    const { service, prisma, links, send } = setup({
      step: { linkMailedAt: mailed, linkReminders: 0 },
      link: { lastSentAt: mailed, expiresAt: new Date(NOW.getTime() + 11 * DAY) },
    });
    expect(await service.sendPending(ORG, 'client@firma.at', NOW)).toBe(true);
    expect(links.mintFor).not.toHaveBeenCalled();
    const html = (send.mock.calls[0][1] as any).html as string;
    expect(html).not.toContain('token=');
    expect(html).toContain('/sign?lost=1');
    expect(prisma.documentSigner.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1'] } },
      data: { linkReminders: { increment: 1 } },
    });
    // A pointer email is not a delivered link: the re-send cooldown stays open.
    expect(links.markSent).not.toHaveBeenCalled();
  });

  it('a 7-day reminder after the link expired mints a new one', async () => {
    const mailed = new Date(NOW.getTime() - 7 * DAY);
    const { service, links, send } = setup({
      step: { linkMailedAt: mailed, linkReminders: 1 },
      link: { lastSentAt: mailed, expiresAt: new Date(NOW.getTime() - 1000) },
    });
    expect(await service.sendPending(ORG, 'client@firma.at', NOW)).toBe(true);
    expect(links.mintFor).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0][1] as any).html).toContain('token=fresh-token');
  });

  it('after two reminders: nothing more, ever', async () => {
    const { service, send } = setup({
      step: { linkMailedAt: new Date(NOW.getTime() - 30 * DAY), linkReminders: 2 },
      link: null,
    });
    expect(await service.sendPending(ORG, 'client@firma.at', NOW)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('only CLIENT steps are read — a member step with an address is never emailed a link', async () => {
    const { service, prisma } = setup({ link: null });
    await service.sendPending(ORG, 'client@firma.at', NOW);
    expect(prisma.documentSigner.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ userId: null, eligibleUserIds: { isEmpty: true } }),
    );
  });
});
