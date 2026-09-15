import { InvitationService } from '../invitation.service';

/*
  A portal invitation goes to a CLIENT, so its language follows the client rule
  (account → client record → organization → English) and is decided here, where
  the client record can be read. notification-service's own fallback for an
  address is the inviting member's language — right for a new colleague, wrong
  for a client — so the event carries the answer rather than leaving the
  question to it.
*/
describe('client invitation language', () => {
  const ORG = 'org-1';

  function setup(opts: { clientLocale?: string | null; country?: string | null; failLookup?: boolean } = {}) {
    const prisma: any = {
      invitation: {
        findFirst: jest.fn(async () => ({
          code: 'ABCDE12345',
          targetRole: 'CUSTOMER',
          expiresAt: new Date('2026-09-30T00:00:00Z'),
          createdById: 'boss',
          organization: { name: 'Acme' },
        })),
      },
      customer: { findFirst: jest.fn(async () => ({ email: 'Office@Billa.at' })) },
      user: {
        findMany: jest.fn(async () => {
          if (opts.failLookup) throw new Error('db down');
          return [];
        }),
      },
      organization: {
        findUnique: jest.fn(async () => ({
          country: opts.country ?? null,
          customers: opts.clientLocale ? [{ id: 'c1', email: 'office@billa.at', locale: opts.clientLocale }] : [],
        })),
      },
    };
    const emit = jest.fn();
    const service = new InvitationService(prisma, { emit } as any, {} as any);
    return { service, emit, prisma };
  }

  it('re-sending a client invitation carries the client’s language', async () => {
    const { service, emit, prisma } = setup({ clientLocale: 'it', country: 'AT' });
    const res = await service.resendInvitation({ organizationId: ORG, customerId: 'c1' });

    expect(res.success).toBe(true);
    const [pattern, payload] = emit.mock.calls[0];
    expect(pattern).toBe('invitation_created');
    expect(payload.locale).toBe('it');
    // Looked up by the client the invitation belongs to, in this organization.
    expect(prisma.organization.findUnique.mock.calls[0][0].where).toEqual({ id: ORG });
    expect(prisma.organization.findUnique.mock.calls[0][0].select.customers.where.OR[0]).toEqual({ id: { in: ['c1'] } });
  });

  it('falls to the organization’s language, and to English — never to the inviter’s', async () => {
    const at = setup({ country: 'AT' });
    await at.service.resendInvitation({ organizationId: ORG, customerId: 'c1' });
    expect(at.emit.mock.calls[0][1].locale).toBe('de');

    const plain = setup();
    await plain.service.resendInvitation({ organizationId: ORG, customerId: 'c1' });
    expect(plain.emit.mock.calls[0][1].locale).toBe('en');

    // A failed lookup still decides — English — rather than handing the choice
    // back to notification-service, which would use the inviting member's.
    const down = setup({ clientLocale: 'it', failLookup: true });
    await down.service.resendInvitation({ organizationId: ORG, customerId: 'c1' });
    expect(down.emit.mock.calls[0][1].locale).toBe('en');
  });
});
