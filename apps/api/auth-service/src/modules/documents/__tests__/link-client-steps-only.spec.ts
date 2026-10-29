import { NotFoundException } from '@nestjs/common';
import { DocumentCustomerSigningService } from '../signing/document-customer-signing.service';
import { CustomerSignLinkService } from '../signing/customer-sign-link.service';

/*
  Staff sign in the app, never through the emailed link.

  Routing freezes an address onto EVERY step it can resolve — a member's step
  carries the member's email. The link resolves signer rows by address, so
  without a client-step filter a member who requested a "new link" for their own
  address could list, open and sign their staff step from a public page with no
  session at all.
*/
describe('the emailed link reaches CLIENT steps only', () => {
  const ADDR = 'anna@acme.at';

  // Anna's own RESPONSIBLE step, current, carrying her address.
  const staffRow = {
    id: 'staff-step',
    order: 2,
    status: 'PENDING',
    openedAt: null,
    userId: 'anna',
    eligibleUserIds: ['anna'],
    customerId: null,
    document: {
      id: 'doc1',
      title: 'Time sheet',
      periodYear: 2026,
      periodMonth: 9,
      storageKey: 'k',
      mimeType: 'application/pdf',
      user: { firstName: 'Mike', lastName: 'W' },
      signers: [
        { order: 1, role: 'MEMBER', status: 'SIGNED', userId: 'mike', eligibleUserIds: ['mike'], customerId: null },
        {
          order: 2,
          role: 'RESPONSIBLE',
          status: 'PENDING',
          userId: 'anna',
          eligibleUserIds: ['anna'],
          customerId: null,
        },
      ],
      signatures: [],
      organization: { name: 'Acme' },
    },
  };

  /** A database that honours the client-step clause, like Postgres would. */
  const honour = (where: any) => (r: any) =>
    !(where.userId === null && r.userId !== null) && !(where.eligibleUserIds?.isEmpty && r.eligibleUserIds.length > 0);

  const prisma: any = {
    documentSigner: {
      findMany: jest.fn(async ({ where }: any) => [staffRow].filter(honour(where))),
      findFirst: jest.fn(async ({ where }: any) => [staffRow].filter(honour(where))[0] ?? null),
      update: jest.fn(),
    },
    documentEvent: { create: jest.fn() },
    customerSignLink: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const storage: any = {
    requireStore: () => ({ presignDownload: jest.fn(async () => 'https://x') }),
    withStorage: (_: string, fn: () => unknown) => fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('the list shows nothing for a staff step at that address', async () => {
    const svc = new DocumentCustomerSigningService(prisma, storage);
    const { toSign, signed } = await svc.listForCustomer({ organizationId: 'org1', email: ADDR });
    expect(toSign).toEqual([]);
    expect(signed).toEqual([]);
  });

  it('a staff step cannot be opened through the link', async () => {
    const svc = new DocumentCustomerSigningService(prisma, storage);
    await expect(
      svc.openForCustomer({ organizationId: 'org1', email: ADDR, signerId: 'staff-step' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('"send me a new link" mints nothing for an address known only from a staff step', async () => {
    const links = new CustomerSignLinkService(prisma);
    expect(await links.requestReissue(ADDR)).toEqual({ send: false });
    expect(prisma.customerSignLink.upsert).not.toHaveBeenCalled();
  });
});
