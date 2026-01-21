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
 * - Max 128 characters
 * - Must contain uppercase, lowercase, and number
 */
export function StrongPasswordField() {
  return applyDecorators(
    IsString(),
    IsNotEmpty({ message: 'Password is required' }),
    MinLength(8, { message: 'Password must be at least 8 characters' }),
    MaxLength(128, { message: 'Password must not exceed 128 characters' }),
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
