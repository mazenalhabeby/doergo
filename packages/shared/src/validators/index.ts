/**
 * Shared Validation Decorators & Utilities
 *
 * Provides reusable validation decorators for consistent input validation
 * across all services. Eliminates duplication of validation logic in DTOs.
 *
 * @example
 * class UserDto {
 *   @EmailField()
 *   email: string;
 *
 *   @PasswordField()
 *   password: string;
 *
 *   @NameField('First name')
 *   firstName: string;
 * }
 */

import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsNotEmpty,
  IsOptional,
  ValidateBy,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { applyDecorators } from '@nestjs/common';

// =============================================================================
// TRANSFORM UTILITIES
// =============================================================================

/**
 * Trim whitespace from string
 */
export const sanitizeString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : String(value);

/**
 * Trim whitespace and convert to lowercase
 */
export const toLowercase = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : String(value);

/**
 * THE canonical form of an email address, for storing AND for looking one up.
 *
 * Sign-in lowercases what it is given, so an address stored as typed
 * ("Mike@Example.com") could never sign in, and a second account could be made
 * for the same mailbox by changing its case. Every place that writes or reads
 * `User.email` passes through this — one rule, not a `.trim().toLowerCase()`
 * typed into each service.
 */
export function normalizeEmail(email: string): string;
export function normalizeEmail(email: string | null | undefined): string | null | undefined;
export function normalizeEmail(email: string | null | undefined): string | null | undefined {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

/**
 * bcrypt reads only the first 72 BYTES of a password and silently ignores the
 * rest — so a 100-character passphrase is really its first 72 bytes, and two
 * passwords sharing those bytes are the same password. Measured in UTF-8 bytes,
 * not characters: "ü" is two, an emoji four.
 */
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export const utf8ByteLength = (value: string): number =>
  typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(value).length
    : Buffer.byteLength(value, 'utf8');

/** Refuse a value longer than `max` UTF-8 bytes. */
export function MaxBytes(max: number, message: string) {
  return ValidateBy({
    name: 'maxBytes',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && utf8ByteLength(value) <= max,
      defaultMessage: () => message,
    },
  });
}

/**
 * Capitalize first letter, lowercase rest
 */
export const capitalizeFirst = (value: unknown): string => {
  if (typeof value !== 'string') return String(value);
  const trimmed = value.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

// =============================================================================
// REGEX PATTERNS
// =============================================================================

/**
 * Name validation: letters, spaces, hyphens, apostrophes
 */
export const NAME_REGEX = /^[a-zA-Z\s\-']+$/;

/**
 * Company name: letters, numbers, spaces, common punctuation
 */
export const COMPANY_REGEX = /^[a-zA-Z0-9\s\-'&.,]+$/;

/**
 * Password: at least one uppercase, lowercase, and number
 */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

/**
 * UUID v4 format
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// =============================================================================
// COMPOSITE VALIDATION DECORATORS
// =============================================================================

/**
 * Email field validation with sanitization
 * - Valid email format
 * - Required (non-empty)
 * - Max 255 characters
 * - Transformed to lowercase
 */
export function EmailField(options?: { optional?: boolean }) {
  const decorators = [
    IsEmail({}, { message: 'Please enter a valid email address' }),
    MaxLength(255, { message: 'Email must not exceed 255 characters' }),
    Transform(({ value }: { value: unknown }) => toLowercase(value)),
  ];

  if (options?.optional) {
    decorators.unshift(IsOptional());
  } else {
    decorators.push(IsNotEmpty({ message: 'Email is required' }));
  }

  return applyDecorators(...decorators);
}

/**
 * Password field validation (for login - no strength requirements)
 * - Required (non-empty)
 * - Min 8 characters
 * - Max 128 characters
 *
 * ⚠️ Deliberately NOT capped at 72 bytes: accounts created before the cap may
 * hold a longer password, and bcrypt compares only its first 72 bytes, so the
 * long form still signs in. The cap belongs where a password is CHOSEN
 * (StrongPasswordField).
 */
export function PasswordField() {
  return applyDecorators(
    IsString(),
    IsNotEmpty({ message: 'Password is required' }),
    MinLength(8, { message: 'Password must be at least 8 characters' }),
    MaxLength(128, { message: 'Password must not exceed 128 characters' }),
  );
}

/**
 * Strong password field validation (for registration/reset)
 * - Required (non-empty)
 * - Min 8 characters
 * - Max 128 characters AND at most 72 UTF-8 bytes (bcrypt's real limit)
 * - Must contain uppercase, lowercase, and number
 */
export function StrongPasswordField() {
  return applyDecorators(
    IsString(),
    IsNotEmpty({ message: 'Password is required' }),
    MinLength(8, { message: 'Password must be at least 8 characters' }),
    MaxLength(128, { message: 'Password must not exceed 128 characters' }),
    // bcrypt ignores everything past 72 bytes — refuse it rather than quietly
    // storing a shorter password than the one the person believes they chose.
    MaxBytes(
      BCRYPT_MAX_PASSWORD_BYTES,
      'Password is too long: use at most 72 bytes (about 72 letters, fewer with accents or emoji)',
    ),
    Matches(PASSWORD_REGEX, {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    }),
  );
}

/**
 * Name field validation (first name, last name)
 * - Required (non-empty)
 * - Min 2 characters
 * - Max 50 characters
 * - Only letters, spaces, hyphens, apostrophes
 * - Transformed to lowercase (or capitalize if specified)
 */
export function NameField(fieldName = 'Name', options?: { capitalize?: boolean; optional?: boolean }) {
  const decorators = [
    IsString(),
    MinLength(2, { message: `${fieldName} must be at least 2 characters` }),
    MaxLength(50, { message: `${fieldName} must not exceed 50 characters` }),
    Matches(NAME_REGEX, { message: `${fieldName} can only contain letters, spaces, hyphens, and apostrophes` }),
    Transform(({ value }: { value: unknown }) => options?.capitalize ? capitalizeFirst(value) : toLowercase(value)),
  ];

  if (options?.optional) {
    decorators.unshift(IsOptional());
  } else {
    decorators.push(IsNotEmpty({ message: `${fieldName} is required` }));
  }

  return applyDecorators(...decorators);
}

/**
 * Company name field validation
 * - Required (non-empty)
 * - Min 2 characters
 * - Max 100 characters
 * - Letters, numbers, spaces, common punctuation
 */
export function CompanyNameField(options?: { optional?: boolean }) {
  const decorators = [
    IsString(),
    MinLength(2, { message: 'Company name must be at least 2 characters' }),
    MaxLength(100, { message: 'Company name must not exceed 100 characters' }),
    Matches(COMPANY_REGEX, { message: 'Company name contains invalid characters' }),
    Transform(({ value }: { value: unknown }) => sanitizeString(value)),
  ];

  if (options?.optional) {
    decorators.unshift(IsOptional());
  } else {
    decorators.push(IsNotEmpty({ message: 'Company name is required' }));
  }

  return applyDecorators(...decorators);
}

/**
 * Token field validation (refresh token, reset token)
 * - Required (non-empty)
 * - String type
 */
export function TokenField(fieldName = 'Token') {
  return applyDecorators(
    IsString(),
    IsNotEmpty({ message: `${fieldName} is required` }),
  );
}

/**
 * Optional string field with sanitization
 * - Optional
 * - Trimmed
 */
export function OptionalStringField() {
  return applyDecorators(
    IsOptional(),
    IsString(),
    Transform(({ value }: { value: unknown }) => sanitizeString(value)),
  );
}

/**
 * Required string field with sanitization
 * - Required
 * - Trimmed
 */
export function RequiredStringField(fieldName = 'Field') {
  return applyDecorators(
    IsString(),
    IsNotEmpty({ message: `${fieldName} is required` }),
    Transform(({ value }: { value: unknown }) => sanitizeString(value)),
  );
}
