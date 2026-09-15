import { CustomerSignMailerService } from '../customer-sign-mailer.service';

/*
  A client's signing link is written in the client's language — the client rule
  every client email follows (`clientEmailLocales` in shared):

    the account behind the address → the client record → the organization → English

  The supplier's own member is never asked: the office writing German says
  nothing about what the client's accounts department reads. Only the system's
  words translate — the organization's name and the document titles go as the
  organization wrote them.
*/
describe('client signing link email language', () => {
  const EXPIRES = new Date('2026-09-20T12:00:00Z');
  const ORG = 'org-1';

  function setup(opts: {
    accounts?: Array<{ email: string; locale: string | null }>;
    clients?: Array<{ id: string; email: string | null; locale: string | null }>;
    country?: string | null;
  } = {}) {
    const accounts = opts.accounts ?? [];
    const clients = opts.clients ?? [];
    const prisma: any = {
      user: {
        findMany: jest.fn(async ({ where }: any) => accounts.filter((a) => where.email.in.includes(a.email))),
      },
      organization: {
        findUnique: jest.fn(async ({ select }: any) => {
          const or = select.customers.where.OR;
          return {
            country: opts.country ?? null,
            customers: clients.filter(
              (c) =>
                c.locale &&
                or.some((cond: any) =>
                  cond.id ? cond.id.in.includes(c.id) : (c.email ?? '').toLowerCase() === cond.email.equals,
                ),
            ),
          };
        }),
      },
    };
    const config = { get: jest.fn(() => undefined) };
    const links = {
      mintFor: jest.fn(async () => ({ token: 't/1', expiresAt: EXPIRES })),
      markSent: jest.fn(),
    };
    const service = new CustomerSignMailerService(prisma, config as any, links as any);
    const send = jest.spyOn(service as any, 'send').mockResolvedValue(true);
    return { service, prisma, send, links };
  }

  const reissue = (service: CustomerSignMailerService, to: string, customerId?: string | null) =>
    service.sendReissue({ to, token: 't/1', expiresAt: EXPIRES, organizationName: 'Acme', organizationId: ORG, customerId });

  it('uses the language of the account behind the address', async () => {
    const { service, send, prisma } = setup({
      accounts: [{ email: 'client@firma.at', locale: 'de' }],
      clients: [{ id: 'c1', email: 'client@firma.at', locale: 'fr' }],
    });
    await reissue(service, 'Client@Firma.at', 'c1');

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    const [to, email] = send.mock.calls[0] as [string, { subject: string; html: string }];
    expect(to).toBe('Client@Firma.at');
    expect(email.subject).toBe('Ihre Dokumente bei Acme');
    expect(email.html).toContain('<html lang="de" dir="ltr">');
    // The token still rides in the query string, encoded.
    expect(email.html).toContain('/sign?token=t%2F1');
  });

  it('otherwise uses the language the office set on the client record', async () => {
    const { service, send } = setup({ clients: [{ id: 'c1', email: 'buchhaltung@firma.it', locale: 'it' }], country: 'AT' });
    await reissue(service, 'buchhaltung@firma.it', 'c1');
    const email = send.mock.calls[0][1] as { subject: string; html: string };
    expect(email.html).toContain('<html lang="it" dir="ltr">');
    // The organization's name is data and goes as written.
    expect(email.subject).toContain('Acme');
    expect(email.subject).not.toBe('Your documents with Acme');
  });

  it('otherwise the organization’s language, then English', async () => {
    const at = setup({ country: 'AT' });
    await reissue(at.service, 'stranger@x.com');
    expect((at.send.mock.calls[0][1] as any).subject).toBe('Ihre Dokumente bei Acme');

    const none = setup({ accounts: [{ email: 'quiet@x.com', locale: null }] });
    await reissue(none.service, 'stranger@x.com');
    await reissue(none.service, 'quiet@x.com');
    expect((none.send.mock.calls[0][1] as any).subject).toBe('Your documents with Acme');
    expect((none.send.mock.calls[1][1] as any).subject).toBe('Your documents with Acme');
  });

  it('the pending sweep asks by the client the signer step names', async () => {
    const { service, send, prisma } = setup({ clients: [{ id: 'c7', email: 'other@firma.es', locale: 'es' }] });
    prisma.customerSignLink = { findUnique: jest.fn(async () => null) };
    prisma.documentSigner = {
      findMany: jest.fn(async () => [
        {
          order: 1,
          customerId: 'c7',
          document: {
            title: 'Stundenzettel KW 37',
            user: { firstName: 'Mira', lastName: 'K' },
            organization: { name: 'Acme' },
            signers: [{ order: 1, status: 'PENDING' }],
          },
        },
      ]),
    };

    expect(await service.sendPending(ORG, 'Einkauf@Firma.es')).toBe(true);
    const email = send.mock.calls[0][1] as { subject: string; html: string };
    expect(email.html).toContain('<html lang="es" dir="ltr">');
    // The document title is the organization's words: not translated.
    expect(email.html).toContain('Stundenzettel KW 37');
    const where = prisma.organization.findUnique.mock.calls[0][0].select.customers.where;
    expect(where.OR[0]).toEqual({ id: { in: ['c7'] } });
  });

  it('still sends, in English, when the lookup fails', async () => {
    const { service, send, prisma } = setup({ country: 'AT' });
    prisma.user.findMany.mockRejectedValueOnce(new Error('db down'));
    await reissue(service, 'a@x');
    expect((send.mock.calls[0][1] as any).subject).toBe('Your documents with Acme');
  });
});
