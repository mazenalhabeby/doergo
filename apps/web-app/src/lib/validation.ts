/**
 * Shared Validation Schemas
 *
 * These schemas mirror the backend DTOs for consistent validation
 * across client and server.
 */

import { z } from 'zod';

// ============================================================================
// Validation Patterns
// ============================================================================

/** Name validation: only letters, spaces, hyphens, and apostrophes */
export const NAME_REGEX = /^[a-zA-Z\s\-']+$/;

/** Company name: letters, numbers, spaces, and common punctuation */
export const COMPANY_REGEX = /^[a-zA-Z0-9\s\-'&.,]+$/;

/** Password requirements pattern */
export const PASSWORD_PATTERNS = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  number: /[0-9]/,
};

// ============================================================================
// Field Schemas (reusable building blocks)
// ============================================================================

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .max(255, 'Email must not exceed 255 characters')
  .transform((val) => val.trim().toLowerCase());

export const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters');

export const strongPasswordSchema = passwordSchema
  .regex(PASSWORD_PATTERNS.uppercase, 'Password must contain at least one uppercase letter')
  .regex(PASSWORD_PATTERNS.lowercase, 'Password must contain at least one lowercase letter')
  .regex(PASSWORD_PATTERNS.number, 'Password must contain at least one number');

export const firstNameSchema = z
  .string()
  .min(1, 'First name is required')
  .min(2, 'First name must be at least 2 characters')
  .max(50, 'First name must not exceed 50 characters')
  .regex(NAME_REGEX, 'First name can only contain letters, spaces, hyphens, and apostrophes')
  .transform((val) => val.trim().toLowerCase());

export const lastNameSchema = z
  .string()
  .min(1, 'Last name is required')
  .min(2, 'Last name must be at least 2 characters')
  .max(50, 'Last name must not exceed 50 characters')
  .regex(NAME_REGEX, 'Last name can only contain letters, spaces, hyphens, and apostrophes')
  .transform((val) => val.trim().toLowerCase());

export const companyNameSchema = z
  .string()
  .min(1, 'Company name is required')
  .min(2, 'Company name must be at least 2 characters')
  .max(100, 'Company name must not exceed 100 characters')
  .regex(COMPANY_REGEX, 'Company name contains invalid characters')
  .transform((val) => val.trim().toLowerCase());

// ============================================================================
// Form Schemas
// ============================================================================

/** Login form validation */
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type LoginFormData = z.infer<typeof loginSchema>;

/** Registration form validation */
export const registerSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  companyName: companyNameSchema,
  email: emailSchema,
  password: strongPasswordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  acceptTerms: z.boolean().refine((val) => val === true, 'You must accept the terms'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export type RegisterFormData = z.infer<typeof registerSchema>;

// ============================================================================
// Password Strength Helpers
// ============================================================================

export interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

export const passwordRequirements: PasswordRequirement[] = [
  { label: '8+ chars', test: (p) => p.length >= 8 },
  { label: 'Upper', test: (p) => PASSWORD_PATTERNS.uppercase.test(p) },
  { label: 'Lower', test: (p) => PASSWORD_PATTERNS.lowercase.test(p) },
  { label: 'Number', test: (p) => PASSWORD_PATTERNS.number.test(p) },
];

/**
 * Calculate password strength score (0-4)
 */
export function getPasswordStrength(password: string): number {
  return passwordRequirements.filter((req) => req.test(password)).length;
}
