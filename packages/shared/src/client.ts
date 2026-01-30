/**
 * Client-safe exports for browser/React/Next.js applications
 *
 * This file only exports modules that DO NOT depend on:
 * - @nestjs/* packages
 * - class-validator
 * - class-transformer
 * - @prisma/client
 *
 * For NestJS backend usage, import from '@doergo/shared' directly.
 */

// Export all types (enums, interfaces, etc.)
export * from './types';

// Export utility functions (date, query string building)
export * from './utils';
