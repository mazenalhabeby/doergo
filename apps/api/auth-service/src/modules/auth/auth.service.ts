import {
  PASSWORD_RESET_EXPIRATION_HOURS,
  mailRoutesFromConfig,
  passwordResetEmail,
  sendViaFirstWorking,
  type MailRoute,
  maskEmail,
  normalizeEmail,
} from '@hbcfield/shared';
import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as nodemailer from 'nodemailer';
import { hashToken } from './auth-common';
import { SessionTokensService } from './session-tokens.service';
import { SignInService } from './sign-in.service';
import { SessionsService } from './sessions.service';
import { TokenValidationService } from './token-validation.service';
import { OwnAccountSecurityService } from './own-account-security.service';
export type { AuthResult } from './auth-common';

/**
 * Authentication — THE FACADE.
 *
 * The work lives in one collaborator per responsibility, beside this file:
 * minting sessions, signing in, a session's life after that, validating a
 * token, and a member's own credentials. This class keeps every method callers
 * already use and hands each to the part that owns it.
 *
 * ⚠️ Outbound email stays HERE — the SMTP routes, their health, and the
 * password-reset message. notification-service's `email-catalogue-guard.spec.ts`
 * polices this exact file for hand-written email, so mail code moved elsewhere
 * would quietly leave that guard.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Every configured way out, primary first. Empty when SMTP is unset. */
  private mailRoutes: Array<MailRoute & { tx: nodemailer.Transporter }> = [];

  /**
   * Cached answer to "can we send mail at all right now?".
   *
   * Checked BEFORE the account lookup and for every address, which is the whole
   * point: an outage message that only appeared for real accounts would be an
   * email-enumeration oracle — submit an address, and whether you got "check
   * your inbox" or "our mail is down" tells you if it is registered. Asked the
   * same way for everyone, it tells an attacker nothing and tells an honest
   * person the truth.
   *
   * Cached because it costs an SMTP handshake. Sixty seconds while healthy;
   * fifteen while broken, so recovery is noticed quickly without hammering a
   * provider that is already refusing us.
   */
  private transportHealth: { ok: boolean; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tokens: SessionTokensService,
    private readonly signIn: SignInService,
    private readonly sessions: SessionsService,
    private readonly validation: TokenValidationService,
    private readonly account: OwnAccountSecurityService,
  ) {
    this.mailRoutes = mailRoutesFromConfig((key) => this.configService.get<string>(key)).map((r) => ({
      ...r,
      tx: nodemailer.createTransport(r.options),
    }));
    if (this.mailRoutes.length) {
      this.logger.log(`SMTP routes: ${this.mailRoutes.map((r) => `${r.label}:${r.options.port} secure=${r.options.secure}`).join(' → ')}`);
    } else {
      this.logger.warn('SMTP not configured - password reset emails will not be sent');
    }
  }

  /** Whether the SMTP transport will accept a connection at all. */
  private async canSendMail(): Promise<boolean> {
    if (!this.mailRoutes.length) return false;
    const ttl = this.transportHealth?.ok ? 60_000 : 15_000;
    if (this.transportHealth && Date.now() - this.transportHealth.at < ttl) return this.transportHealth.ok;

    // ANY route working is enough — that is the point of having two.
    const failures: string[] = [];
    for (const r of this.mailRoutes) {
      try {
        await r.tx.verify();
        this.transportHealth = { ok: true, at: Date.now() };
        return true;
      } catch (err) {
        failures.push(`${r.label}: ${(err as Error).message}`);
      }
    }
    // Error, not warning: while EVERY route is failing, nothing the product
    // sends by email arrives — resets, invitations, notifications.
    this.logger.error(`No usable SMTP route — ${failures.join(' | ')}`);
    this.transportHealth = { ok: false, at: Date.now() };
    return false;
  }

  /**
   * Can this platform send email at all, and if not, why?
   *
   * For the operator console. The outage this exists for ran unnoticed because
   * its only symptom was a line in a container log — every screen that sends
   * mail reported success, because from their point of view the request had
   * succeeded. Somewhere has to show the truth.
   */
  async mailHealth() {
    if (!this.mailRoutes.length) {
      return { success: true, data: { configured: false, ok: false, routes: [], host: null, port: null, error: 'SMTP is not configured' } };
    }
    // Every route is checked even after one succeeds: with a fallback in place
    // the product keeps working while the primary is broken, and "email works"
    // would then hide that the primary has been failing for weeks.
    const routes = await Promise.all(
      this.mailRoutes.map(async (r) => {
        try {
          await r.tx.verify();
          return { label: r.label, host: r.options.host, port: r.options.port, ok: true, error: null as string | null };
        } catch (err) {
          return { label: r.label, host: r.options.host, port: r.options.port, ok: false, error: (err as Error).message };
        }
      }),
    );
    const ok = routes.some((r) => r.ok);
    this.transportHealth = { ok, at: Date.now() };
    const first = routes[0];
    return {
      success: true,
      data: {
        configured: true,
        ok,
        routes,
        host: first.host,
        port: first.port,
        error: ok ? null : routes.map((r) => `${r.label}: ${r.error}`).join(' | '),
      },
    };
  }

  /**
   * The reset email, in the language the member reads the app in.
   *
   * The words are the shared template's (`passwordResetEmail`), so this and the
   * invitation a member received cannot drift apart in tone or in language.
   * `locale` comes from the same row the address does — no extra query.
   */
  private async sendPasswordResetEmail(
    user: { email: string; firstName: string; locale: string | null },
    resetToken: string,
  ) {
    if (!this.mailRoutes.length) {
      this.logger.warn('Cannot send password reset email - SMTP not configured');
      return;
    }

    const appUrl = this.configService.get('APP_URL', 'https://hbcfield.hbc-solution.io');
    const resetLink = `${appUrl}/reset-password?token=${resetToken}`;
    const fallbackFrom = this.configService.get('SMTP_FROM', 'noreply@hbcfield.eu');

    try {
      // Rendered once so every route sends the same message.
      const { subject, html } = passwordResetEmail(user.locale, {
        firstName: user.firstName,
        resetLink,
        expiresInHours: PASSWORD_RESET_EXPIRATION_HOURS,
      });
      const { label } = await sendViaFirstWorking(
        this.mailRoutes.map((r) => ({
          label: r.label,
          send: () => r.tx.sendMail({ from: r.from || fallbackFrom, to: user.email, subject, html }),
        })),
      );
      this.logger.log(`Password reset email sent to ${maskEmail(user.email)} via ${label}`);
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${maskEmail(user.email)}: ${err}`);
    }
  }

  register(...args: Parameters<SignInService['register']>) {
    return this.signIn.register(...args);
  }

  login(...args: Parameters<SignInService['login']>) {
    return this.signIn.login(...args);
  }

  buildSession(...args: Parameters<SessionTokensService['buildSession']>) {
    return this.tokens.buildSession(...args);
  }

  buildSessionForUser(...args: Parameters<SessionTokensService['buildSessionForUser']>) {
    return this.tokens.buildSessionForUser(...args);
  }

  refresh(...args: Parameters<SessionsService['refresh']>) {
    return this.sessions.refresh(...args);
  }

  logout(...args: Parameters<SessionsService['logout']>) {
    return this.sessions.logout(...args);
  }

  async forgotPassword(data: { email: string }) {
    try {
      // Normalize email
      const email = normalizeEmail(data.email);

      /*
        Is our own mail working? Asked first, and for every address, so the
        answer cannot be used to probe which addresses are registered.

        Without this the page told everybody "we've sent you a link" while the
        provider was refusing every connection at the greeting — the request
        looked successful, the reset never arrived, and the only trace was a
        line in a container log.
      */
      if (!(await this.canSendMail())) {
        return {
          success: false,
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'We cannot send email at the moment, so we could not send a reset link. This is a problem on our side — please try again shortly or contact support.',
        };
      }

      // Find user - but don't reveal if email exists (security best practice)
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, firstName: true, locale: true },
      });

      // SECURITY: Always return success to prevent email enumeration attacks
      const successResponse = {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      };

      if (!user) {
        // Log attempt but return success to prevent enumeration
        this.logger.log(`Password reset requested for non-existent email: ${maskEmail(email)}`);
        return successResponse;
      }

      // Delete any existing unused tokens for this user
      await this.prisma.passwordResetToken.deleteMany({
        where: {
          userId: user.id,
          used: false,
        },
      });

      // Generate a secure random token
      const resetToken = randomUUID() + randomUUID(); // Extra entropy
      const tokenHash = hashToken(resetToken);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRATION_HOURS * 60 * 60 * 1000);

      // Store the hashed token
      await this.prisma.passwordResetToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt,
        },
      });

      // Send password reset email
      await this.sendPasswordResetEmail(user, resetToken);
      this.logger.log(`Password reset token generated for user: ${maskEmail(email)}`);

      return successResponse;
    } catch (error) {
      this.logger.error('Forgot password error:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to process password reset request. Please try again.',
      };
    }
  }

  resetPassword(...args: Parameters<OwnAccountSecurityService['resetPassword']>) {
    return this.account.resetPassword(...args);
  }

  cleanupExpiredTokensCron(...args: Parameters<SessionsService['cleanupExpiredTokensCron']>) {
    return this.sessions.cleanupExpiredTokensCron(...args);
  }

  cleanupExpiredTokens(...args: Parameters<SessionsService['cleanupExpiredTokens']>) {
    return this.sessions.cleanupExpiredTokens(...args);
  }

  validateToken(...args: Parameters<TokenValidationService['validateToken']>) {
    return this.validation.validateToken(...args);
  }

  listSessions(...args: Parameters<SessionsService['listSessions']>) {
    return this.sessions.listSessions(...args);
  }

  revokeSession(...args: Parameters<SessionsService['revokeSession']>) {
    return this.sessions.revokeSession(...args);
  }

  revokeAllSessions(...args: Parameters<SessionsService['revokeAllSessions']>) {
    return this.sessions.revokeAllSessions(...args);
  }

  updateAvatar(...args: Parameters<OwnAccountSecurityService['updateAvatar']>) {
    return this.account.updateAvatar(...args);
  }

  removeAvatar(...args: Parameters<OwnAccountSecurityService['removeAvatar']>) {
    return this.account.removeAvatar(...args);
  }

  changePassword(...args: Parameters<OwnAccountSecurityService['changePassword']>) {
    return this.account.changePassword(...args);
  }

  deleteAccount(...args: Parameters<OwnAccountSecurityService['deleteAccount']>) {
    return this.account.deleteAccount(...args);
  }
}
