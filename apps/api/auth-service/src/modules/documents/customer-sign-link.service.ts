import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  generateSecret,
  hashSecret,
  signLinkExpiry,
  signLinkRefusal,
  canReissue,
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
    customerId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ token: string | null; expiresAt: Date }> {
    const existing = await this.prisma.customerSignLink.findUnique({
      where: { organizationId_customerId: { organizationId, customerId } },
      select: { expiresAt: true },
    });

    if (!opts.force && existing && signLinkRefusal(existing) === null) {
      // Still good. The plaintext is gone and cannot be recovered — by design.
      return { token: null, expiresAt: existing.expiresAt };
    }

    const token = generateSecret();
    const expiresAt = signLinkExpiry();
    await this.prisma.customerSignLink.upsert({
      where: { organizationId_customerId: { organizationId, customerId } },
      create: { organizationId, customerId, tokenHash: hashSecret(token), expiresAt },
      update: { tokenHash: hashSecret(token), expiresAt, firstOpenedAt: null },
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
    | { ok: true; link: { id: string; organizationId: string; customerId: string; expiresAt: Date };
        customer: { id: string; name: string; email: string | null }; organizationName: string }
    | { ok: false; refusal: SignLinkRefusal }
  > {
    if (!token || token.length < 20) return { ok: false, refusal: 'unknown' };

    const link = await this.prisma.customerSignLink.findUnique({
      where: { tokenHash: hashSecret(token) },
      select: {
        id: true, organizationId: true, customerId: true, expiresAt: true,
        customer: { select: { id: true, name: true, email: true, isActive: true } },
        organization: { select: { name: true } },
      },
    });

    // A deactivated client reads as unknown, not expired: they are not owed an
    // offer of a new link to documents they are no longer party to.
    if (!link || !link.customer?.isActive) return { ok: false, refusal: 'unknown' };

    const refusal = signLinkRefusal(link);
    if (refusal) return { ok: false, refusal };

    return {
      ok: true,
      link: { id: link.id, organizationId: link.organizationId, customerId: link.customerId, expiresAt: link.expiresAt },
      customer: { id: link.customer.id, name: link.customer.name, email: link.customer.email },
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
    { send: false } | { send: true; to: string; token: string; expiresAt: Date; linkId: string; organizationName: string; customerName: string }
  > {
    const addr = email.trim().toLowerCase();
    if (!addr || addr.length > 320) return { send: false };

    // A client with nothing outstanding and nothing signed has no reason to be
    // sent a link at all.
    const customer = await this.prisma.customer.findFirst({
      where: {
        isActive: true,
        email: { equals: addr, mode: 'insensitive' },
        documentSignerSteps: { some: {} },
      },
      select: { id: true, name: true, email: true, organizationId: true,
                organization: { select: { name: true } } },
    });
    if (!customer?.email) return { send: false };

    const link = await this.prisma.customerSignLink.findUnique({
      where: { organizationId_customerId: { organizationId: customer.organizationId, customerId: customer.id } },
      select: { id: true, lastSentAt: true },
    });
    // Per-address cooldown. The gateway throttles per IP, which stops one
    // machine hammering the form; this stops many machines being pointed at one
    // client's inbox.
    if (link && !canReissue(link.lastSentAt)) return { send: false };

    const { token, expiresAt } = await this.mintFor(customer.organizationId, customer.id, { force: true });
    const fresh = await this.prisma.customerSignLink.findUnique({
      where: { organizationId_customerId: { organizationId: customer.organizationId, customerId: customer.id } },
      select: { id: true },
    });
    if (!token || !fresh) return { send: false };

    return {
      send: true,
      to: customer.email,
      token,
      expiresAt,
      linkId: fresh.id,
      organizationName: customer.organization?.name ?? '',
      customerName: customer.name,
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
