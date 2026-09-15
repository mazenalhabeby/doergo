import { CustomerSignMailerService } from '../customer-sign-mailer.service';

/*
  A client's signing link is written in the language of the account behind the
  address, when there is one — otherwise in English, as it always was.

  The Customer record has no language, and the supplier's own language is not a
  signal about the client's: the office writing German says nothing about what
  the client's accounts department reads. A portal client, though, chose a
  language when they signed in, and that is the reader telling us directly.
*/
describe('client signing link email language', () => {
  const EXPIRES = new Date('2026-09-20T12:00:00Z');

  function setup(accounts: Array<{ email: string; locale: string | null }>) {
    const prisma = {
      user: {
        findMany: jest.fn(async ({ where }: any) => accounts.filter((a) => where.email.in.includes(a.email))),
      },
    };
    const config = { get: jest.fn(() => undefined) };
    const service = new CustomerSignMailerService(prisma as any, config as any, {} as any);
    const send = jest.spyOn(service as any, 'send').mockResolvedValue(true);
    return { service, prisma, send };
  }

  it('uses the language of the account behind the address', async () => {
    const { service, send, prisma } = setup([{ email: 'client@firma.at', locale: 'de' }]);
    await service.sendReissue({ to: 'Client@Firma.at', token: 't/1', expiresAt: EXPIRES, organizationName: 'Acme' });

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    const [to, email] = send.mock.calls[0] as [string, { subject: string; html: string }];
    expect(to).toBe('Client@Firma.at');
    expect(email.subject).toBe('Ihre Dokumente bei Acme');
    expect(email.html).toContain('<html lang="de" dir="ltr">');
    // The token still rides in the query string, encoded.
    expect(email.html).toContain('/sign?token=t%2F1');
  });

  it('keeps English for an address with no account, or an account with no language', async () => {
    const { service, send } = setup([{ email: 'quiet@x.com', locale: null }]);
    await service.sendReissue({ to: 'stranger@x.com', token: 't', expiresAt: EXPIRES, organizationName: 'Acme' });
    await service.sendReissue({ to: 'quiet@x.com', token: 't', expiresAt: EXPIRES, organizationName: 'Acme' });
    expect((send.mock.calls[0][1] as any).subject).toBe('Your documents with Acme');
    expect((send.mock.calls[1][1] as any).subject).toBe('Your documents with Acme');
  });

  it('still sends, in English, when the lookup fails', async () => {
    const { service, send, prisma } = setup([]);
    prisma.user.findMany.mockRejectedValueOnce(new Error('db down'));
    await service.sendReissue({ to: 'a@x', token: 't', expiresAt: EXPIRES, organizationName: 'Acme' });
    expect((send.mock.calls[0][1] as any).subject).toBe('Your documents with Acme');
  });
});
