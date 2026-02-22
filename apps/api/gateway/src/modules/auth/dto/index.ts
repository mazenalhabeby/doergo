import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import {
  EmailField,
  PasswordField,
  StrongPasswordField,
  NameField,
  CompanyNameField,
  TokenField,
} from '@doergo/shared';

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

  @ApiPropertyOptional({ example: false, description: 'Keep user signed in for 30 days (default: false = 24h)' })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

/**
 * Registration request DTO
 */
export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @EmailField()
  email: string;

  @ApiProperty({ example: 'Password123', description: 'Password (min 8 chars, must include uppercase, lowercase, and number)' })
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

  // NOTE: Role is NOT accepted from user input - always set to ADMIN on backend
}

/**
 * Refresh token request DTO
 */
export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token for getting new access token' })
  @TokenField('Refresh token')
  refreshToken: string;
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

  @ApiProperty({ example: 'NewPassword123', description: 'New password (min 8 chars, must include uppercase, lowercase, and number)' })
  @StrongPasswordField()
  newPassword: string;
}
