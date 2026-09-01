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

      const { token } = await service.mintFor('org1', 'cust1');
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
      const { token } = await service.mintFor('org1', 'cust1');
      expect((token as string).length).toBeGreaterThanOrEqual(40);
    });

    it('expires it', async () => {
      prisma.customerSignLink.findUnique.mockResolvedValue(null);
      const before = Date.now();
      await service.mintFor('org1', 'cust1');
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
      const { token } = await service.mintFor('org1', 'cust1');
      expect(token).toBeNull();
      expect(prisma.customerSignLink.upsert).not.toHaveBeenCalled();
    });

    it('replaces the hash when forced, so the previous link stops working', async () => {
      prisma.customerSignLink.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      const { token } = await service.mintFor('org1', 'cust1', { force: true });
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
      customer: { id: 'cust1', name: 'Binderholz', email: 'office@binderholz.com', isActive: true },
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
    it('sends nothing for an address nobody here uses', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      expect(await service.requestReissue('stranger@example.com')).toEqual({ send: false });
    });

    it('sends nothing for a client with no documents at all', async () => {
      // The query requires at least one signer row; a client who has never been
      // asked to sign anything has no link to be sent.
      prisma.customer.findFirst.mockResolvedValue(null);
      const res = await service.requestReissue('office@binderholz.com');
      expect(res).toEqual({ send: false });
      expect(prisma.customer.findFirst.mock.calls[0][0].where.documentSignerSteps).toEqual({ some: {} });
    });

    it('sends to the address ON FILE, never to the one typed in', async () => {
      /*
        The form asks for an address so it can FIND a client, and for no other
        reason. If the typed address decided where mail went, anybody could
        redirect a company's documents to themselves by typing their own.
      */
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust1', name: 'Binderholz', email: 'office@binderholz.com',
        organizationId: 'org1', organization: { name: 'HBC USA Inc.' },
      });
      prisma.customerSignLink.findUnique
        .mockResolvedValueOnce({ id: 'link1', lastSentAt: null })  // cooldown check
        .mockResolvedValueOnce(null)                                // mintFor: no live link
        .mockResolvedValueOnce({ id: 'link1' });                    // re-read after mint

      const res: any = await service.requestReissue('OFFICE@BINDERHOLZ.COM');
      expect(res.send).toBe(true);
      expect(res.to).toBe('office@binderholz.com');
    });

    it('refuses inside the cooldown, so the form cannot be a mail bomb', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust1', name: 'Binderholz', email: 'office@binderholz.com',
        organizationId: 'org1', organization: { name: 'HBC USA Inc.' },
      });
      prisma.customerSignLink.findUnique.mockResolvedValue({
        id: 'link1',
        lastSentAt: new Date(),
      });
      expect(await service.requestReissue('office@binderholz.com')).toEqual({ send: false });
    });
  });
});
