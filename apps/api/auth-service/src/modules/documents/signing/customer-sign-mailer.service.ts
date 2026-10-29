import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import {
  mailRoutesFromConfig,
  sendViaFirstWorking,
  runWithCronLock,
  signLinkRefusal,
  SIGN_LINK_REMINDER_DAYS,
  clientEmailLocale,
  signLinkEmail,
  signReissueEmail,
  DEFAULT_LOCALE,
  type MailRoute,
  type RenderedEmail,
  type SupportedLocale,
  normalizeEmail,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { CustomerSignLinkService } from './customer-sign-link.service';
import { clientStepsWaiting, recordStepsMailed } from './customer-sign-waiting';
import { CLIENT_STEP_WHERE } from '../common/actor';

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
    this.routes = mailRoutesFromConfig((key) => this.config.get<string>(key)).map((r) => ({
      ...r,
      tx: nodemailer.createTransport(r.options),
    }));

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
   * Email one client about what is waiting for them — when the sweep says a
   * step is OWED an email (its first, or the 3- and 7-day reminder), never
   * otherwise.
   *
   * The link is NOT rotated while it still works: only its hash is kept, so a
   * new email cannot carry the old token, and minting a new one would kill the
   * link the client may be about to click. So:
   *
   *   no link, expired, or never delivered   mint one and send it
   *   a live link the client already holds   send the list, point at the
   *                                          earlier email, and offer the page
   *                                          where a new link is asked for
   *
   * A link is rotated only when somebody asks for a new one (the re-send form).
   * Returns false when nothing was sent; never reports success it did not get.
   */
  async sendPending(organizationId: string, email: string, now: Date = new Date()): Promise<boolean> {
    const addr = normalizeEmail(email);

    const waiting = await clientStepsWaiting(this.prisma, organizationId, addr, now);
    if (!waiting.some((w) => w.due)) return false;
    const customerId = waiting.find((w) => w.customerId)?.customerId ?? null;

    const link = await this.prisma.customerSignLink.findUnique({
      where: { organizationId_email: { organizationId, email: addr } },
      select: { id: true, lastSentAt: true, expiresAt: true },
    });
    const holdsLiveLink = !!link && !!link.lastSentAt && signLinkRefusal(link, now) === null;

    let url: string | undefined;
    let expiresAt: Date;
    if (holdsLiveLink) {
      expiresAt = link.expiresAt;
    } else {
      const minted = await this.links.mintFor(organizationId, addr, { force: true, customerId });
      if (!minted.token) return false;
      url = this.signUrl(minted.token);
      expiresAt = minted.expiresAt;
    }

    const sent = await this.send(
      addr,
      signLinkEmail(await this.localeFor(organizationId, addr, customerId), {
        organizationName: waiting[0].organizationName,
        documents: waiting.map((w) => ({ title: w.title, forMember: w.forMember })),
        url,
        expiresAt,
        earlier: holdsLiveLink
          ? { sentAt: link.lastSentAt as Date, askUrl: `${this.appUrl()}/sign?lost=1` }
          : undefined,
      }),
    );
    if (!sent) return false;

    await recordStepsMailed(this.prisma, waiting, now);
    // Only an email that CARRIED a token counts as the link being delivered —
    // marking a pointer email would also start the re-send cooldown on the
    // client who then asks for a new link.
    if (url) {
      const row = await this.prisma.customerSignLink.findUnique({
        where: { organizationId_email: { organizationId, email: addr } },
        select: { id: true },
      });
      if (row) await this.links.markSent(row.id);
    }
    return true;
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
   * The one rule every client-facing sender follows (`clientEmailLocale` in
   * shared): the account behind the address, then the client record's language,
   * then the organization's, then English. The client is found by the record
   * the signer step names when there is one, else by the address among this
   * organization's clients.
   *
   * Deliberately NOT the issuing member's language: the client is a different
   * company. Only the system's words follow it — the document titles and the
   * organization's name in the email go as the organization wrote them. A
   * lookup that fails costs the language, never the email.
   */
  private async localeFor(
    organizationId: string,
    address: string,
    customerId?: string | null,
  ): Promise<SupportedLocale> {
    try {
      return await clientEmailLocale(this.prisma, organizationId, { email: address, customerId });
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
    to: string;
    token: string;
    expiresAt: Date;
    organizationName: string;
    organizationId: string;
    customerId?: string | null;
  }): Promise<boolean> {
    return this.send(
      data.to,
      signReissueEmail(await this.localeFor(data.organizationId, data.to, data.customerId), {
        organizationName: data.organizationName,
        url: this.signUrl(data.token),
        expiresAt: data.expiresAt,
      }),
    );
  }

  /**
   * The sweep — what makes eleven documents one email, and one email per turn.
   *
   * Every minute, find client steps still owed something (no first email yet,
   * or fewer than two reminders) and ask `sendPending` once per address. It
   * sends only when a step is actually due, and records what it sent ON THE
   * STEP, so a client is emailed when their turn comes, reminded at 3 and 7
   * days, and then left alone.
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
            ...CLIENT_STEP_WHERE,
            linkReminders: { lt: SIGN_LINK_REMINDER_DAYS.length },
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
        if (sent > 0) this.logger.log(`Sent ${sent} client signing email(s)`);
      },
    );
  }
}
