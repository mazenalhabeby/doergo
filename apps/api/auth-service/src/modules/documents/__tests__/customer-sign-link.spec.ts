import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CustomerSignLinkService } from '../customer-sign-link.service';
import { hashSecret, SIGN_LINK_TTL_DAYS } from '@hbcfield/shared';

/**
 * The link a client holds instead of a login.
 *
 * Everything here is about what the token may and may not reveal. It is the
 * only credential in this product handed to somebody outside the organisation,
 * and the only one that arrives by email — so the interesting cases are not the
 * happy path but the four ways it can be wrong, and what each of them says back.
 */
describe('CustomerSignLinkService', () => {
  let service: CustomerSignLinkService;

  const prisma: Record<string, any> = {
    customerSignLink: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ id: 'link1' }),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    customer: { findFirst: jest.fn() },
    documentSigner: { findFirst: jest.fn() },
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ ok: true }]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.customerSignLink.upsert.mockResolvedValue({ id: 'link1' });

    const mod = await Test.createTestingModule({
      providers: [CustomerSignLinkService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(CustomerSignLinkService);
  });

  describe('minting', () => {
    it('stores only the digest — never the token', async () => {
      /*
        The plaintext exists inside one email and nowhere else. A database dump
        must not hand somebody a working signing link, which is exactly what
        invitation codes do by keeping the plaintext beside the hash.
      */
      prisma.customerSignLink.findUnique.mockResolvedValue(null);

      const { token } = await service.mintFor('org1', 'office@binderholz.com');
      const stored = prisma.customerSignLink.upsert.mock.calls[0][0];

      expect(token).toBeTruthy();
      expect(stored.create.tokenHash).toBe(hashSecret(token as string));
      expect(JSON.stringify(stored)).not.toContain(token as string);
    });

    it('mints a token long enough to be a bearer credential', async () => {
      // The invitation code's ten characters over a 32-symbol alphabet is ~50
      // bits, which is right for something a person types and far too little
      // for the only thing between a stranger and a company's paperwork.
      prisma.customerSignLink.findUnique.mockResolvedValue(null);
      const { token } = await service.mintFor('org1', 'office@binderholz.com');
      expect((token as string).length).toBeGreaterThanOrEqual(40);
    });

    it('expires it', async () => {
      prisma.customerSignLink.findUnique.mockResolvedValue(null);
      const before = Date.now();
      await service.mintFor('org1', 'office@binderholz.com');
      const { expiresAt } = prisma.customerSignLink.upsert.mock.calls[0][0].create;
      const days = (expiresAt.getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThan(SIGN_LINK_TTL_DAYS - 0.01);
    });

    it('does not re-mint over a live link, and cannot recover its token', async () => {
      // The plaintext is genuinely gone. A caller that wanted to re-send must
      // force a new one — which kills the old, and is the honest outcome.
      prisma.customerSignLink.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      const { token } = await service.mintFor('org1', 'office@binderholz.com');
      expect(token).toBeNull();
      expect(prisma.customerSignLink.upsert).not.toHaveBeenCalled();
    });

    it('replaces the hash when forced, so the previous link stops working', async () => {
      prisma.customerSignLink.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      const { token } = await service.mintFor('org1', 'office@binderholz.com', { force: true });
      expect(token).toBeTruthy();
      // Two live links would be two people able to sign as the client.
      expect(prisma.customerSignLink.upsert.mock.calls[0][0].update.tokenHash).toBe(
        hashSecret(token as string),
      );
    });
  });

  describe('resolving a token', () => {
    const live = {
      id: 'link1',
      organizationId: 'org1',
      customerId: 'cust1',
      expiresAt: new Date(Date.now() + 86_400_000),
      email: 'office@binderholz.com',
      customer: { name: 'Binderholz', isActive: true },
      organization: { name: 'HBC USA Inc.' },
    };

    it('finds a client by the digest, never by the token', async () => {
      prisma.customerSignLink.findUnique.mockResolvedValue(live);
      const res = await service.resolve('a-token-long-enough-to-be-real-xxxx');

      expect(prisma.customerSignLink.findUnique.mock.calls[0][0].where.tokenHash).toBe(
        hashSecret('a-token-long-enough-to-be-real-xxxx'),
      );
      expect(res.ok).toBe(true);
    });

    it('refuses an unknown token without saying anything about it', async () => {
      prisma.customerSignLink.findUnique.mockResolvedValue(null);
      const res = await service.resolve('a-token-long-enough-to-be-real-xxxx');
      expect(res).toEqual({ ok: false, refusal: 'unknown' });
    });

    it('refuses a short token without touching the database', async () => {
      // Nothing that short can be one of ours, and a lookup would be a free
      // timing signal plus a query per guess.
      const res = await service.resolve('abc');
      expect(res).toEqual({ ok: false, refusal: 'unknown' });
      expect(prisma.customerSignLink.findUnique).not.toHaveBeenCalled();
    });

    it('offers a new link when the old one merely expired', async () => {
      prisma.customerSignLink.findUnique.mockResolvedValue({
        ...live,
        expiresAt: new Date(Date.now() - 1000),
      });
      const res = await service.resolve('a-token-long-enough-to-be-real-xxxx');
      expect(res).toEqual({ ok: false, refusal: 'expired' });
    });

    it('stands on its own when there is no client row at all', async () => {
      // A space contact or a one-off address has nothing to deactivate. The
      // link rests on the signer rows addressed to it.
      prisma.customerSignLink.findUnique.mockResolvedValue({ ...live, customer: null });
      const res: any = await service.resolve('a-token-long-enough-to-be-real-xxxx');
      expect(res.ok).toBe(true);
      expect(res.counterpartyName).toBe('office@binderholz.com');
    });

    it('treats a deactivated client as unknown, not expired', async () => {
      /*
        They are not owed an offer of a fresh link to documents they are no
        longer party to — and "expired" would confirm the address had been a
        client here, which is the one thing this endpoint must never confirm.
      */
      prisma.customerSignLink.findUnique.mockResolvedValue({
        ...live,
        customer: { ...live.customer, isActive: false },
      });
      const res = await service.resolve('a-token-long-enough-to-be-real-xxxx');
      expect(res).toEqual({ ok: false, refusal: 'unknown' });
    });
  });

  describe('asking for a new link', () => {
    const addressed = {
      customerId: 'cust1',
      document: { organizationId: 'org1', organization: { name: 'HBC USA Inc.' } },
    };

    it('sends nothing for an address nothing was ever addressed to', async () => {
      prisma.documentSigner.findFirst.mockResolvedValue(null);
      expect(await service.requestReissue('stranger@example.com')).toEqual({ send: false });
    });

    it('sends nothing for an address that is not one', async () => {
      // Rejected before any query — a malformed address cannot match a row, and
      // asking would be a free query per guess.
      expect(await service.requestReissue('not-an-address')).toEqual({ send: false });
      expect(prisma.documentSigner.findFirst).not.toHaveBeenCalled();
    });

    it('finds the person by the SIGNER ROW, not by a client record', async () => {
      /*
        Two of the three kinds of counterparty have no client record at all — a
        client space carries its own contact, and a one-off address has nothing.
        The row is what was actually addressed, so it is what gets searched.
      */
      prisma.documentSigner.findFirst.mockResolvedValue(addressed);
      prisma.customerSignLink.findUnique
        .mockResolvedValueOnce({ id: 'link1', lastSentAt: null })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'link1' });

      const res: any = await service.requestReissue('OFFICE@BINDERHOLZ.COM');
      expect(res.send).toBe(true);
      // Normalised, and sent to the address that was addressed — never to
      // whatever casing or spelling somebody typed into the form.
      expect(res.to).toBe('office@binderholz.com');
      expect(prisma.documentSigner.findFirst.mock.calls[0][0].where.email).toBe('office@binderholz.com');
    });

    it('refuses inside the cooldown, so the form cannot be a mail bomb', async () => {
      prisma.documentSigner.findFirst.mockResolvedValue(addressed);
      prisma.customerSignLink.findUnique.mockResolvedValue({ id: 'link1', lastSentAt: new Date() });
      expect(await service.requestReissue('office@binderholz.com')).toEqual({ send: false });
    });
  });
});
