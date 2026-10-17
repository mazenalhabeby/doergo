import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  EmailField,
  PasswordField,
  StrongPasswordField,
  NameField,
  CompanyNameField,
  TokenField,
} from '@hbcfield/shared';

/**
 * Login request DTO
 */
export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @EmailField()
  email: string;

  @ApiProperty({ example: 'Password123', description: 'User password' })
  @PasswordField()
  password: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Web only: keep signed in for 30 days (default: false = 24h). Ignored for ' + 'mobile (90d).',
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @ApiPropertyOptional({
    enum: ['web', 'mobile'],
    description: 'Client platform. web → rememberMe (24h/30d); mobile/absent → 90d.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  client?: string;
}

/**
 * Registration request DTO
 */
export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @EmailField()
  email: string;

  @ApiProperty({
    example: 'Password123',
    description: 'Password (min 8 chars, must include uppercase, lowercase, and number)',
  })
  @StrongPasswordField()
  password: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @NameField('First name', { capitalize: true })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @NameField('Last name', { capitalize: true })
  lastName: string;

  @ApiPropertyOptional({ example: 'Acme Inc.', description: 'Company name (omit to register without organization)' })
  @CompanyNameField({ optional: true })
  companyName?: string;

  @ApiPropertyOptional({ example: 'Main Office', description: "Name of the org's first space" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstSpaceName?: string;

  // NOTE: Role is NOT accepted from user input - always set to ADMIN on backend
}

/**
 * Refresh token request DTO
 */
export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Refresh token (optional — can also be sent via httpOnly cookie)' })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  /**
   * This device's push registration, so signing out also stops the pushes.
   *
   * ⚠️ Sent HERE rather than left to `DELETE /users/push-token/:token`, which
   * is what used to do it. That call ran AFTER the session had been torn down,
   * and it was best effort: one failure — no signal at the moment of signing
   * out, the app killed mid-logout — orphaned the row forever, because the
   * phone clears its cached token either way and can never name it again. The
   * member then kept receiving their own notifications on a phone they had
   * signed out of, with nothing on either side able to stop it.
   *
   * Logout is the one request that is definitionally authenticated at the
   * moment it runs, so the removal belongs in it.
   */
  @ApiPropertyOptional({ description: "This device's Expo push token, removed as part of signing out" })
  @IsOptional()
  @IsString()
  pushToken?: string;
}

/**
 * Forgot password request DTO
 */
export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email address for password reset' })
  @EmailField()
  email: string;
}

/**
 * Reset password request DTO
 */
export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token from email' })
  @TokenField('Reset token')
  token: string;

  @ApiProperty({
    example: 'NewPassword123',
    description: 'New password (min 8 chars, must include uppercase, lowercase, and number)',
  })
  @StrongPasswordField()
  newPassword: string;
}

/**
 * Change password request DTO (authenticated)
 */
export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassword123', description: 'Current password' })
  @PasswordField()
  currentPassword: string;

  @ApiProperty({
    example: 'NewPassword123',
    description: 'New password (min 8 chars, must include uppercase, lowercase, and number)',
  })
  @StrongPasswordField()
  newPassword: string;
}

/**
 * Delete account request DTO (authenticated, requires password confirmation)
 */
export class DeleteAccountDto {
  @ApiProperty({ example: 'Password123', description: 'Current password to confirm account deletion' })
  @PasswordField()
  password: string;
}
