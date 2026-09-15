import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  autoClockOutEmail,
  DEFAULT_LOCALE,
  geofenceAlertEmail,
  groupByLocale,
  invitationEmail,
  mailRoutes,
  sendViaFirstWorking,
  taskAssignedEmail,
  taskCompletedEmail,
  type MailRoute,
  type RenderedEmail,
  type SupportedLocale,
} from '@hbcfield/shared';
import { RecipientLocales } from '../../i18n/recipient-locales.service';

/** Somebody an email goes to. `id` is what carries their language; without one it is English. */
export interface EmailRecipient {
  id?: string | null;
  email: string;
}

/**
 * Delivery, and the choice of language. Never the words.
 *
 * What each email SAYS lives in `@hbcfield/shared` (email-templates.ts), keyed
 * by language, because auth-service and task-service send mail too and all
 * three must say the same thing the same way. What this service decides is
 * who reads which language — one query for a whole recipient list, the same
 * RecipientLocales the pushes use — and that each language is rendered ONCE
 * however many people read it.
 *
 * `email-catalogue-guard.spec.ts` fails if a subject or a line of markup is
 * written here again.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private routes: Array<MailRoute & { tx: nodemailer.Transporter }> = [];

  constructor(
    private configService: ConfigService,
    private readonly locales: RecipientLocales,
  ) {
    // The same routes the auth service uses, resolved the same way: primary
    // first, then the fallback, so one provider refusing us does not stop the
    // product sending mail.
    this.routes = mailRoutes({
      SMTP_HOST: this.configService.get('SMTP_HOST'),
      SMTP_PORT: this.configService.get('SMTP_PORT'),
      SMTP_USER: this.configService.get('SMTP_USER'),
      SMTP_PASS: this.configService.get('SMTP_PASS'),
      SMTP_SECURE: this.configService.get('SMTP_SECURE'),
      SMTP_FROM: this.configService.get('SMTP_FROM'),
      SMTP_FALLBACK_HOST: this.configService.get('SMTP_FALLBACK_HOST'),
      SMTP_FALLBACK_PORT: this.configService.get('SMTP_FALLBACK_PORT'),
      SMTP_FALLBACK_USER: this.configService.get('SMTP_FALLBACK_USER'),
      SMTP_FALLBACK_PASS: this.configService.get('SMTP_FALLBACK_PASS'),
      SMTP_FALLBACK_SECURE: this.configService.get('SMTP_FALLBACK_SECURE'),
      SMTP_FALLBACK_FROM: this.configService.get('SMTP_FALLBACK_FROM'),
    }).map((r) => ({ ...r, tx: nodemailer.createTransport(r.options) }));
    if (this.routes.length) {
      this.logger.log(`SMTP routes: ${this.routes.map((r) => r.label).join(' → ')}`);
    } else {
      this.logger.warn('SMTP not configured — no email will be sent');
    }
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      if (!this.routes.length) {
        this.logger.warn(`No SMTP route — dropping email to ${to} ("${subject}")`);
        return;
      }
      const fallbackFrom = this.configService.get('SMTP_FROM', 'noreply@hbcfield.com');
      const { label } = await sendViaFirstWorking(
        this.routes.map((r) => ({
          label: r.label,
          send: () => r.tx.sendMail({ from: r.from || fallbackFrom, to, subject, html }),
        })),
      );
      this.logger.log(`Email sent to ${to} via ${label}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to send email:', error);
      return { success: false, error };
    }
  }

  private send(to: string, email: RenderedEmail) {
    return this.sendEmail(to, email.subject, email.html);
  }

  /**
   * One email per recipient, each in the recipient's language.
   *
   * Languages are loaded for the whole list in one query, and the message is
   * rendered once per language rather than once per person: a geofence alert
   * to six managers who read two languages is one lookup and two renders.
   * Addresses repeated in the list get one email.
   */
  async sendToMembers(recipients: EmailRecipient[], render: (locale: SupportedLocale) => RenderedEmail): Promise<void> {
    const seen = new Set<string>();
    const unique = recipients.filter((r) => {
      const key = r.email?.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length === 0) return;

    const locales = await this.locales.localesFor(unique.map((r) => r.id));
    const groups = groupByLocale(unique, (r) => (r.id && locales.get(r.id)) || DEFAULT_LOCALE);
    for (const [locale, group] of groups) {
      const email = render(locale);
      for (const r of group) {
        try {
          await this.send(r.email, email);
        } catch (error) {
          this.logger.error(`Failed to send email to ${r.email}: ${error}`);
        }
      }
    }
  }

  async sendTaskAssignedEmail(task: Parameters<typeof taskAssignedEmail>[1], assignee: EmailRecipient) {
    return this.sendToMembers([assignee], (locale) => taskAssignedEmail(locale, task));
  }

  async sendTaskCompletedEmail(task: Parameters<typeof taskCompletedEmail>[1], creator: EmailRecipient) {
    return this.sendToMembers([creator], (locale) => taskCompletedEmail(locale, task));
  }

  // =========================================================================
  // ATTENDANCE NOTIFICATIONS
  // =========================================================================

  async sendAutoClockOutEmail(
    data: Parameters<typeof autoClockOutEmail>[1] & { userId?: string | null; userEmail: string },
  ) {
    return this.sendToMembers([{ id: data.userId, email: data.userEmail }], (locale) =>
      autoClockOutEmail(locale, data),
    );
  }

  /** To everybody who watches the member — each in their own language. */
  async sendGeofenceAlertEmail(
    data: Parameters<typeof geofenceAlertEmail>[1] & { recipients: EmailRecipient[] },
  ) {
    return this.sendToMembers(data.recipients, (locale) => geofenceAlertEmail(locale, data));
  }

  /**
   * An invitation goes to an ADDRESS, usually of somebody with no account yet.
   * Language: their own account if the address is one, else the inviting
   * member's, else English (RecipientLocales.forAddress).
   */
  async sendInvitationEmail(
    data: Parameters<typeof invitationEmail>[1] & { recipientEmail: string; inviterId?: string | null },
  ) {
    const locale = await this.locales.forAddress(data.recipientEmail, data.inviterId);
    return this.send(data.recipientEmail, invitationEmail(locale, data));
  }
}
