import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SessionTokensService } from './session-tokens.service';
import { SignInService } from './sign-in.service';
import { SessionsService } from './sessions.service';
import { TokenValidationService } from './token-validation.service';
import { OwnAccountSecurityService } from './own-account-security.service';
import { AuthMailService } from './auth-mail.service';
import { SessionControlService } from './session-control.service';
import { RegisterService } from './register.service';
import { PasswordResetService } from './password-reset.service';
import { AccountDeletionService } from './account-deletion.service';

export type { AuthResult } from './auth-common';

/**
 * Authentication — THE FACADE.
 *
 * The work lives in one collaborator per responsibility, beside this file:
 * minting sessions, signing in, a session's life after that, validating a
 * token, and a member's own credentials. This class keeps every method callers
 * already use and hands each to the part that owns it.
 *
 * Outbound email — the SMTP routes, their health and the password-reset message —
 * is `AuthMailService` (auth-mail.service.ts), the file the email guard polices.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tokens: SessionTokensService,
    private readonly signIn: SignInService,
    private readonly registration: RegisterService,
    private readonly sessions: SessionsService,
    private readonly sessionControl: SessionControlService,
    private readonly validation: TokenValidationService,
    private readonly account: OwnAccountSecurityService,
    private readonly accountDeletion: AccountDeletionService,
    private readonly passwordReset: PasswordResetService,
    private readonly mail: AuthMailService,
  ) {}

  forgotPassword(...args: Parameters<AuthMailService['forgotPassword']>) {
    return this.mail.forgotPassword(...args);
  }

  mailHealth(...args: Parameters<AuthMailService['mailHealth']>) {
    return this.mail.mailHealth(...args);
  }

  register(...args: Parameters<RegisterService['register']>) {
    return this.registration.register(...args);
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

  resetPassword(...args: Parameters<PasswordResetService['resetPassword']>) {
    return this.passwordReset.resetPassword(...args);
  }

  cleanupExpiredTokens(...args: Parameters<SessionControlService['cleanupExpiredTokens']>) {
    return this.sessionControl.cleanupExpiredTokens(...args);
  }

  validateToken(...args: Parameters<TokenValidationService['validateToken']>) {
    return this.validation.validateToken(...args);
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

  deleteAccount(...args: Parameters<AccountDeletionService['deleteAccount']>) {
    return this.accountDeletion.deleteAccount(...args);
  }
}
