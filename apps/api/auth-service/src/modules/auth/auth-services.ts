import { AuthService } from './auth.service';
import { SessionTokensService } from './session-tokens.service';
import { TokenPairService } from './token-pair.service';
import { SignInService } from './sign-in.service';
import { AuthMailService } from './auth-mail.service';
import { SessionsService } from './sessions.service';
import { TokenValidationService } from './token-validation.service';
import { OwnAccountSecurityService } from './own-account-security.service';
import { SessionControlService } from './session-control.service';
import { RegisterService } from './register.service';
import { PasswordResetService } from './password-reset.service';
import { AccountDeletionService } from './account-deletion.service';

/**
 * Authentication as providers: the `AuthService` facade and the collaborators
 * it hands each responsibility to.
 *
 * One list, read by the module AND by every spec that builds the service, so a
 * collaborator added here can never be missing from one of them.
 */
export const AUTH_SERVICES = [
  AuthService,
  SessionTokensService,
  TokenPairService,
  SignInService,
  AuthMailService,
  RegisterService,
  SessionsService,
  SessionControlService,
  TokenValidationService,
  OwnAccountSecurityService,
  PasswordResetService,
  AccountDeletionService,
];
