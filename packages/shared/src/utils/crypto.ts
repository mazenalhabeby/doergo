import { createHash, randomBytes } from 'crypto';

/**
 * Hash a string using SHA-256.
 * Used for hashing invitation codes, org join codes, and tokens.
 */
export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Generate a random alphanumeric code of the given length using the given charset.
 * Uses crypto.randomBytes for secure randomness.
 */
export function generateSecureCode(length: number, charset: string): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += charset[bytes[i]! % charset.length];
  }
  return code;
}
