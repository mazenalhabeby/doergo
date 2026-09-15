import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import {
  mailRoutes,
  sendViaFirstWorking,
  runWithCronLock,
  canReissue,
  localesByAddress,
  signLinkEmail,
  signReissueEmail,
  DEFAULT_LOCALE,
  type MailRoute,
  type RenderedEmail,
  type SupportedLocale,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomerSignLinkService } from './customer-sign-link.service';

/**
 * Telling a client that documents are waiting for them.
 *
 * Sent from auth-service rather than emitted to notification-service, for one
 * reason that matters: `emit()` is fire-and-forget, so a caller can never learn
 * that the mail did not go. Here the transport is verified before anything is
 * marked as sent, which is the difference between a document that is genuinely
 * waiting and one that only looks it.
 *
 * ONE email per client per sweep, never one per document. A supplier issuing
 * eleven time sheets at 09:00 would otherwise send eleven messages carrying
 * eleven links to eleven identical ceremonies, which is how you teach somebody
 * to ignore your email.
 */
@Injectable()
export class CustomerSignMailerService {
  private readonly logger = new Logger(CustomerSignMailerService.name);
  private routes: Array<MailRoute & { tx: nodemailer.Transporter }> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly links: CustomerSignLinkService,
  ) {
    this.routes = mailRoutes({
      SMTP_HOST: this.config.get('SMTP_HOST'),
      SMTP_PORT: this.config.get('SMTP_PORT'),
      SMTP_USER: this.config.get('SMTP_USER'),
      SMTP_PASS: this.config.get('SMTP_PASS'),
      SMTP_SECURE: this.config.get('SMTP_SECURE'),
      SMTP_FROM: this.config.get('SMTP_FROM'),
      SMTP_FALLBACK_HOST: this.config.get('SMTP_FALLBACK_HOST'),
      SMTP_FALLBACK_PORT: this.config.get('SMTP_FALLBACK_PORT'),
      SMTP_FALLBACK_USER: this.config.get('SMTP_FALLBACK_USER'),
      SMTP_FALLBACK_PASS: this.config.get('SMTP_FALLBACK_PASS'),
      SMTP_FALLBACK_SECURE: this.config.get('SMTP_FALLBACK_SECURE'),
      SMTP_FALLBACK_FROM: this.config.get('SMTP_FALLBACK_FROM'),
    }).map((r) => ({ ...r, tx: nodemailer.createTransport(r.options) }));

    if (!this.routes.length) {
      this.logger.warn('SMTP not configured — clients cannot be sent signing links');
    }
  }

  /** Whether a link email can be sent at all. Callers that report to a person
   *  should ask FIRST, so an outage is stated rather than implied. */
  async canSend(): Promise<boolean> {
    if (!this.routes.length) return false;
    for (const r of this.routes) {
      try {
        await r.tx.verify();
        return true;
      } catch {
        /* try the next route — that is why there are two */
      }
    }
    return false;
  }

  private appUrl(): string {
    return (this.config.get<string>('APP_URL') || 'https://hbcfield.com').replace(/\/+$/, '');
  }

  /**
   * Send one client everything that is waiting for them.
   *
   * Returns false when nothing was sent — no address, no transport, or the
   * cooldown has not elapsed. The caller decides what to say about that; this
   * never reports success it did not achieve.
   */
  async sendPending(organizationId: string, email: string): Promise<boolean> {
    const addr = email.trim().toLowerCase();

    const link = await this.prisma.customerSignLink.findUnique({
      where: { organizationId_email: { organizationId, email: addr } },
      select: { id: true, lastSentAt: true },
    });
    if (link && !canReissue(link.lastSentAt)) return false;

    const { toSign, customerId, organizationName } = await this.documentsWaiting(organizationId, addr);
    if (toSign.length === 0) return false;

    /*
      A fresh link every time.

      The plaintext exists only inside an email, so somebody who deleted the
      last one has no way back to it — minting anew is the only way to send a
      usable link, and it kills the previous one, which is what we want.
    */
    const { token, expiresAt } = await this.links.mintFor(organizationId, addr, { force: true, customerId });
    if (!token) return false;

    const sent = await this.send(
      addr,
      signLinkEmail(await this.localeFor(addr), {
        organizationName,
        documents: toSign,
        url: this.signUrl(token),
        expiresAt,
      }),
    );

    if (!sent) return false;
    const row = await this.prisma.customerSignLink.findUnique({
      where: { organizationId_email: { organizationId, email: addr } },
      select: { id: true },
    });
    if (row) await this.links.markSent(row.id);
    return true;
  }

  /** Titles of what is genuinely this client's turn — the list the email names. */
  private async documentsWaiting(organizationId: string, email: string) {
    const rows = await this.prisma.documentSigner.findMany({
      where: {
        email,
        status: 'PENDING',
        document: { organizationId, status: 'AWAITING_SIGNATURE' },
      },
      select: {
        order: true,
        customerId: true,
        document: {
          select: {
            title: true,
            user: { select: { firstName: true, lastName: true } },
            organization: { select: { name: true } },
            signers: { select: { order: true, status: true } },
          },
        },
      },
      orderBy: { document: { issuedAt: 'asc' } },
      take: 50,
    });

    // Only steps whose turn it actually is. A document three signatures away is
    // not theirs yet, and naming it in an email invites a countersignature on
    // work the supplier has not finished approving.
    const live = rows.filter((r) => {
      const pending = r.document.signers
        .filter((s) => s.status === 'PENDING')
        .sort((a, b) => a.order - b.order);
      return pending[0]?.order === r.order;
    });

    return {
      toSign: live.map((r) => ({
        title: r.document.title,
        forMember: r.document.user
          ? `${r.document.user.firstName} ${r.document.user.lastName}`.trim()
          : null,
      })),
      customerId: live.find((r) => r.customerId)?.customerId ?? null,
      organizationName: live[0]?.document.organization?.name ?? '',
    };
  }

  private async send(to: string, email: RenderedEmail): Promise<boolean> {
    const { subject, html } = email;
    if (!this.routes.length) {
      this.logger.warn(`No SMTP route — not sending "${subject}"`);
      return false;
    }
    try {
      const fallbackFrom = this.config.get<string>('SMTP_FROM') || 'noreply@hbcfield.com';
      await sendViaFirstWorking(
        this.routes.map((r) => ({
          label: r.label,
          send: () => r.tx.sendMail({ from: r.from || fallbackFrom, to, subject, html }),
        })),
      );
      return true;
    } catch (err) {
      // Error, not warning: while this is failing, no client can be reached and
      // every chain waiting on one is stalled with nothing on screen to say so.
      this.logger.error(`Could not send a signing link to ${to}: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Which language a client's email is written in.
   *
   * A client is an ADDRESS, and the Customer record carries no language — so
   * the only real signal is an account behind that address (a portal client
   * who signs in, or a member of another organization who countersigns), whose
   * own chosen language wins. Anybody else gets English, as every client did
   * before.
   *
   * Deliberately NOT the issuing member's language: the client is a different
   * company, and "the supplier's office writes German" says nothing about what
   * the client's accounts department reads. When Customer gains a language
   * field, it slots in between the account and the default, here and nowhere
   * else. A lookup that fails costs the language, never the email.
   */
  private async localeFor(address: string): Promise<SupportedLocale> {
    try {
      return (await localesByAddress(this.prisma, [address])).get(address.trim().toLowerCase()) ?? DEFAULT_LOCALE;
    } catch (err) {
      this.logger.warn(`Could not look up a language for a signing link: ${(err as Error).message}`);
      return DEFAULT_LOCALE;
    }
  }

  /**
   * The token rides in the QUERY STRING of a web-app URL. It never reaches the
   * gateway this way, and the gateway logs every request path it does see.
   */
  private signUrl(token: string): string {
    return `${this.appUrl()}/sign?token=${encodeURIComponent(token)}`;
  }

  /** The re-issue mail: same page, no document list — they asked for the way
   *  back, not for news. */
  async sendReissue(data: {
    to: string; token: string; expiresAt: Date; organizationName: string;
  }): Promise<boolean> {
    return this.send(
      data.to,
      signReissueEmail(await this.localeFor(data.to), {
        organizationName: data.organizationName,
        url: this.signUrl(data.token),
        expiresAt: data.expiresAt,
      }),
    );
  }

  /**
   * The sweep — what actually makes eleven documents one email.
   *
   * Every minute, find clients with something genuinely waiting whose link has
   * not been sent since the newest of it, and send once. The per-client
   * cooldown inside `sendPending` does the debouncing, so a burst of documents
   * issued together produces a single message a few minutes later rather than
   * one per document.
   *
   * The lease is not optional: NestJS starts this schedule in EVERY replica.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    await runWithCronLock(
      this.prisma,
      { name: 'documents:customerSignMail', ttlSeconds: 55, logger: this.logger },
      async () => {
        const due = await this.prisma.documentSigner.findMany({
          where: {
            status: 'PENDING',
            email: { not: null },
            notifiedAt: { not: null },
            document: { status: 'AWAITING_SIGNATURE' },
          },
          select: { email: true, document: { select: { organizationId: true } } },
          take: 500,
        });

        // One send per ADDRESS, however many documents it is owed — which is
        // the whole reason eleven time sheets are one email.
        const seen = new Set<string>();
        let sent = 0;
        for (const row of due) {
          if (!row.email) continue;
          const key = `${row.document.organizationId}:${row.email}`;
          if (seen.has(key)) continue;
          seen.add(key);
          try {
            if (await this.sendPending(row.document.organizationId, row.email)) sent++;
          } catch (err) {
            this.logger.warn(`Signing-link sweep failed for ${key}: ${(err as Error).message}`);
          }
        }
        if (sent > 0) this.logger.log(`Sent ${sent} client signing link email(s)`);
      },
    );
  }
}
