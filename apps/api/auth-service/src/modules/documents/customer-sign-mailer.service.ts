import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import {
  mailRoutes,
  sendViaFirstWorking,
  runWithCronLock,
  canReissue,
  type MailRoute,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomerSignLinkService } from './customer-sign-link.service';

/** HTML-escape. Every interpolation below goes through it. */
const esc = (s: string): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
  async sendPending(organizationId: string, customerId: string): Promise<boolean> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, isActive: true },
      select: { id: true, name: true, email: true, organization: { select: { name: true } } },
    });
    if (!customer?.email) return false;

    const link = await this.prisma.customerSignLink.findUnique({
      where: { organizationId_customerId: { organizationId, customerId } },
      select: { id: true, lastSentAt: true },
    });
    if (link && !canReissue(link.lastSentAt)) return false;

    const { toSign } = await this.documentsWaiting(organizationId, customerId);
    if (toSign.length === 0) return false;

    /*
      A fresh link every time.

      The plaintext exists only inside an email, so a client who deleted the
      last one has no way back to it — minting anew is the only way to send a
      usable link, and it kills the previous one, which is what we want.
    */
    const { token, expiresAt } = await this.links.mintFor(organizationId, customerId, { force: true });
    if (!token) return false;

    const sent = await this.send(
      customer.email,
      toSign.length === 1
        ? `A document needs your signature — ${customer.organization?.name ?? ''}`.trim()
        : `${toSign.length} documents need your signature — ${customer.organization?.name ?? ''}`.trim(),
      this.html({
        organizationName: customer.organization?.name ?? '',
        documents: toSign,
        token,
        expiresAt,
      }),
    );

    if (!sent) return false;
    const row = await this.prisma.customerSignLink.findUnique({
      where: { organizationId_customerId: { organizationId, customerId } },
      select: { id: true },
    });
    if (row) await this.links.markSent(row.id);
    return true;
  }

  /** Titles of what is genuinely this client's turn — the list the email names. */
  private async documentsWaiting(organizationId: string, customerId: string) {
    const rows = await this.prisma.documentSigner.findMany({
      where: {
        customerId,
        status: 'PENDING',
        document: { organizationId, status: 'AWAITING_SIGNATURE' },
      },
      select: {
        order: true,
        document: {
          select: {
            title: true,
            user: { select: { firstName: true, lastName: true } },
            signers: { select: { order: true, status: true } },
          },
        },
      },
      orderBy: { document: { issuedAt: 'asc' } },
      take: 50,
    });

    // Only steps whose turn it actually is. A document three signatures away is
    // not theirs yet, and naming it in an email invites a countersignature on
    // work their supplier has not finished approving.
    const toSign = rows
      .filter((r) => {
        const pending = r.document.signers
          .filter((s) => s.status === 'PENDING')
          .sort((a, b) => a.order - b.order);
        return pending[0]?.order === r.order;
      })
      .map((r) => ({
        title: r.document.title,
        forMember: r.document.user
          ? `${r.document.user.firstName} ${r.document.user.lastName}`.trim()
          : null,
      }));
    return { toSign };
  }

  private async send(to: string, subject: string, html: string): Promise<boolean> {
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
   * The message.
   *
   * In the house style the invitation email already uses — 600px, Arial, the
   * blue wordmark — because a client who has seen one email from this product
   * should recognise the next.
   *
   * It names the documents rather than counting them, because a client who
   * cannot tell what is waiting has to open the link to find out whether it
   * matters. It gives the expiry as a DATE, since the mail may be read a week
   * after it arrives. And it attaches nothing: the file is the thing being
   * signed, and a copy loose in a mailbox is a copy nobody can prove anything
   * about.
   */
  private html(data: {
    organizationName: string;
    documents: { title: string; forMember: string | null }[];
    token: string;
    expiresAt: Date;
  }): string {
    const org = esc(data.organizationName);
    const many = data.documents.length > 1;
    // The token rides in the QUERY STRING of a web-app URL. It never reaches
    // the gateway this way, and the gateway logs every request path it does see.
    const url = `${this.appUrl()}/sign?token=${encodeURIComponent(data.token)}`;
    const until = data.expiresAt.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    const items = data.documents
      .map((d) => `<li style="color:#1e293b;font-size:14px;margin-bottom:5px;">${esc(d.title)}${
        d.forMember ? ` — ${esc(d.forMember)}` : ''
      }</li>`)
      .join('');

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; padding: 30px 0;">
          <h1 style="color: #2563eb; margin: 0;">HBC FIELD</h1>
          <p style="color: #64748b; margin-top: 4px;">Field Service Management</p>
        </div>

        <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; text-align: center;">
          <h2 style="color: #1e293b; margin-top: 0;">
            ${many ? `${data.documents.length} documents need your signature` : 'A document needs your signature'}
          </h2>
          <p style="color: #475569;">
            <strong>${org}</strong> has asked you to countersign the work below.
            ${many ? 'Each one has' : 'It has'} already been signed by the worker and approved by
            the person responsible for them.
          </p>

          <div style="background:#eef4ff;border:1px solid #cfe0ff;border-radius:10px;padding:14px 16px;margin:18px 0;text-align:left;">
            <p style="color:#64748b;font-size:12px;margin:0 0 8px 0;">Waiting for you</p>
            <ul style="margin:0;padding-left:18px;">${items}</ul>
          </div>

          <a href="${esc(url)}"
             style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:9px;font-weight:bold;margin:6px 0 14px;">
            Review and sign
          </a>

          <p style="color:#94a3b8;font-size:13px;margin-bottom:0;">
            ${many ? 'You can sign them all at once. ' : ''}This link is valid until <strong>${esc(until)}</strong>
            and stays your way back to these documents — if it expires, you can ask for a new one
            from the same page.
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
          You are receiving this because ${org} listed you as the client for this work.<br>
          HBCField · hbcfield.com
        </p>
      </div>
    `;
  }

  /** The re-issue mail: same page, no document list — they asked for the way
   *  back, not for news. */
  async sendReissue(data: {
    to: string; token: string; expiresAt: Date; organizationName: string;
  }): Promise<boolean> {
    const url = `${this.appUrl()}/sign?token=${encodeURIComponent(data.token)}`;
    const until = data.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    return this.send(
      data.to,
      `Your documents with ${data.organizationName}`.trim(),
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; padding: 30px 0;">
          <h1 style="color: #2563eb; margin: 0;">HBC FIELD</h1>
        </div>
        <div style="background-color:#f8fafc;border-radius:12px;padding:24px;text-align:center;">
          <h2 style="color:#1e293b;margin-top:0;">Here is your link</h2>
          <p style="color:#475569;">
            It opens your documents with <strong>${esc(data.organizationName)}</strong> — both the
            ones waiting for your signature and the ones you have already signed.
          </p>
          <a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:9px;font-weight:bold;margin:6px 0 14px;">
            Open my documents
          </a>
          <p style="color:#94a3b8;font-size:13px;margin-bottom:0;">
            Valid until <strong>${esc(until)}</strong>. Any earlier link you were sent no longer works.
          </p>
        </div>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
        <p style="color:#94a3b8;font-size:12px;text-align:center;">HBCField · hbcfield.com</p>
      </div>`,
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
            customerId: { not: null },
            notifiedAt: { not: null },
            document: { status: 'AWAITING_SIGNATURE' },
          },
          select: { customerId: true, document: { select: { organizationId: true } } },
          take: 500,
        });

        // One send per client, however many documents they are owed.
        const seen = new Set<string>();
        let sent = 0;
        for (const row of due) {
          if (!row.customerId) continue;
          const key = `${row.document.organizationId}:${row.customerId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          try {
            if (await this.sendPending(row.document.organizationId, row.customerId)) sent++;
          } catch (err) {
            this.logger.warn(`Signing-link sweep failed for ${key}: ${(err as Error).message}`);
          }
        }
        if (sent > 0) this.logger.log(`Sent ${sent} client signing link email(s)`);
      },
    );
  }
}
