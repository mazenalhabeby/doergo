import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  generateSecret,
  hashSecret,
  signLinkExpiry,
  signLinkRefusal,
  canReissue,
  isUsableEmail,
  runWithCronLock,
  type SignLinkRefusal,
  type SignableDocument,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The one way in for a client who has no login here.
 *
 * This service owns the LINK and nothing else — minting, resolving, expiring
 * and re-issuing. It cannot sign anything and does not know how: signing lives
 * with documents, where the hashes and the seal are. Keeping the two apart is
 * what stops a token check drifting into a second, weaker copy of the
 * authorization the signing path already does.
 */
@Injectable()
export class CustomerSignLinkService {
  private readonly logger = new Logger(CustomerSignLinkService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The live link for a client, minting one if there is none.
   *
   * Returns the plaintext ONLY when it is newly minted — that is the single
   * moment it exists outside the email. A caller that just wants to know
   * whether a client can be reached gets `token: null` and must not invent one.
   *
   * Re-issuing replaces the hash on the same row, which kills the previous
   * link. Two live links is two people able to sign as the client.
   */
  async mintFor(
    organizationId: string,
    email: string,
    opts: { force?: boolean; customerId?: string | null } = {},
  ): Promise<{ token: string | null; expiresAt: Date }> {
    const addr = email.trim().toLowerCase();
    if (!isUsableEmail(addr)) throw new BadRequestException('A usable email address is required');

    const existing = await this.prisma.customerSignLink.findUnique({
      where: { organizationId_email: { organizationId, email: addr } },
      select: { expiresAt: true },
    });

    if (!opts.force && existing && signLinkRefusal(existing) === null) {
      // Still good. The plaintext is gone and cannot be recovered — by design.
      return { token: null, expiresAt: existing.expiresAt };
    }

    const token = generateSecret();
    const expiresAt = signLinkExpiry();
    await this.prisma.customerSignLink.upsert({
      where: { organizationId_email: { organizationId, email: addr } },
      create: {
        organizationId,
        email: addr,
        customerId: opts.customerId ?? null,
        tokenHash: hashSecret(token),
        expiresAt,
      },
      update: {
        tokenHash: hashSecret(token),
        expiresAt,
        firstOpenedAt: null,
        ...(opts.customerId ? { customerId: opts.customerId } : {}),
      },
    });
    return { token, expiresAt };
  }

  /**
   * Who a token belongs to.
   *
   * Looked up BY the digest, so the database index does the comparison and
   * there is no string compare to time. Returns the refusal rather than a
   * boolean: "expired" earns an offer of a new link, "unknown" must say nothing
   * at all, and the two cannot share a code path without eventually sharing a
   * message.
   */
  async resolve(token: string): Promise<
    | {
        ok: true;
        link: { id: string; organizationId: string; email: string; expiresAt: Date };
        counterpartyName: string;
        organizationName: string;
      }
    | { ok: false; refusal: SignLinkRefusal }
  > {
    if (!token || token.length < 20) return { ok: false, refusal: 'unknown' };

    const link = await this.prisma.customerSignLink.findUnique({
      where: { tokenHash: hashSecret(token) },
      select: {
        id: true,
        organizationId: true,
        email: true,
        expiresAt: true,
        customer: { select: { name: true, isActive: true } },
        organization: { select: { name: true } },
      },
    });

    if (!link) return { ok: false, refusal: 'unknown' };
    /*
      A deactivated CLIENT reads as unknown, not expired — they are not owed an
      offer of a fresh link to documents they are no longer party to, and
      "expired" would confirm the address had been a client here.

      A link with no client row is a space contact or a one-off address, and has
      nothing to deactivate. It stands on the signer rows alone.
    */
    if (link.customer && !link.customer.isActive) return { ok: false, refusal: 'unknown' };

    const refusal = signLinkRefusal(link);
    if (refusal) return { ok: false, refusal };

    return {
      ok: true,
      link: {
        id: link.id,
        organizationId: link.organizationId,
        email: link.email,
        expiresAt: link.expiresAt,
      },
      counterpartyName: link.customer?.name ?? link.email,
      organizationName: link.organization?.name ?? '',
    };
  }

  /** First follow of a link — the difference between "sent" and "seen", and so
   *  between chasing the client and chasing the mail provider. */
  async markOpened(linkId: string): Promise<void> {
    await this.prisma.customerSignLink.updateMany({
      where: { id: linkId, firstOpenedAt: null },
      data: { firstOpenedAt: new Date() },
    });
  }

  /** Records that a link was mailed — and is what the cooldown reads. */
  async markSent(linkId: string): Promise<void> {
    await this.prisma.customerSignLink.update({
      where: { id: linkId },
      data: { lastSentAt: new Date(), sentCount: { increment: 1 } },
    });
  }

  /**
   * "Send me a new link."
   *
   * The one part of this a stranger can reach, so it is built to give nothing
   * away. The address is used to FIND a client and never to decide where mail
   * goes — the link is always sent to the address already on file, so the form
   * cannot redirect anybody's documents. The caller reports the same sentence
   * whatever happens here.
   */
  async requestReissue(email: string): Promise<
    | { send: false }
    | { send: true; to: string; token: string; expiresAt: Date; linkId: string; organizationName: string }
  > {
    const addr = email.trim().toLowerCase();
    if (!isUsableEmail(addr)) return { send: false };

    /*
      Anything genuinely addressed to this person, anywhere.

      Matched on the signer row rather than on a client record, because two of
      the three kinds of counterparty have no record: a client space carries its
      own contact, and a one-off address has nothing at all. The row is the
      thing that was actually addressed, so it is the thing to search.
    */
    const row = await this.prisma.documentSigner.findFirst({
      where: { email: addr },
      select: {
        customerId: true,
        document: { select: { organizationId: true, organization: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!row?.document) return { send: false };

    const organizationId = row.document.organizationId;

    const link = await this.prisma.customerSignLink.findUnique({
      where: { organizationId_email: { organizationId, email: addr } },
      select: { id: true, lastSentAt: true },
    });
    // Per-address cooldown. The gateway throttles per IP, which stops one
    // machine hammering the form; this stops many machines being pointed at
    // one person's inbox.
    if (link && !canReissue(link.lastSentAt)) return { send: false };

    const { token, expiresAt } = await this.mintFor(organizationId, addr, {
      force: true,
      customerId: row.customerId,
    });
    const fresh = await this.prisma.customerSignLink.findUnique({
      where: { organizationId_email: { organizationId, email: addr } },
      select: { id: true },
    });
    if (!token || !fresh) return { send: false };

    return {
      send: true,
      to: addr,
      token,
      expiresAt,
      linkId: fresh.id,
      organizationName: row.document.organization?.name ?? '',
    };
  }

  /**
   * Drop links nobody can use any more.
   *
   * An expired row is not dangerous — every read checks the date — but a table
   * that only grows is a table that eventually has to be explained. The lease
   * is not optional: NestJS starts this schedule in EVERY replica.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredLinks(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'documents:signLinkPurge', ttlSeconds: 900, logger: this.logger },
      async () => {
        // A grace period, so a client who followed a stale link the morning
        // after it died still gets "expired, here is a new one" rather than
        // "unknown".
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const { count } = await this.prisma.customerSignLink.deleteMany({
          where: { expiresAt: { lt: cutoff } },
        });
        if (count > 0) this.logger.log(`Purged ${count} expired signing link(s)`);
      },
    );
  }
}

/** Re-exported so callers need one import for the shape they render. */
export type { SignableDocument };
