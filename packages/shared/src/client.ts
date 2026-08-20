/**
 * Client-safe exports for browser/React/Next.js applications
 *
 * This file only exports modules that DO NOT depend on:
 * - @nestjs/* packages
 * - class-validator
 * - class-transformer
 * - @prisma/client
 *
 * For NestJS backend usage, import from '@hbcfield/shared' directly.
 */

// Export all types (enums, interfaces, etc.)
export * from './types';

// Billing (plans, seat pricing, seat classifier, API types) — pure, client-safe
export * from './billing';

// Support (ticket/message types, per-tier SLA + priority helpers) — pure, client-safe
export * from './support';

// Chat (member-to-member conversation/message types) — pure, client-safe
export * from './chat';

// Setup wizard engine (guided org builder catalog + classifier) — pure, client-safe
export * from './setup';

// Customer portal (intake types, seed templates, helpers) — pure, client-safe
export * from './customer-portal';

// Export utility functions (date, query string building)
export * from './utils';

// IANA timezone → country name (for attendance display labels)
export * from './timezone-country';

// Client-safe constants (pure data — no server deps)
export * from './constants/attendance';
// Task status vocabulary and the overdue rule. Pure data + pure functions, and
// the client needs them: every task view asks "is this finished / overdue?".
export * from './constants/task';
// The single per-task authorization rule — pure, shared by every service.
export * from './access/task-access';
export * from './access/cross-org-chat';
export * from './access/legacy-flag-migration';
export * from './access/workflow-modules';
export * from './access/workflow-validation';
export * from './access/workflow-template';
export * from './access/workflow-scope';
export * from './access/asset-kind-shape';
export * from './access/workflow-status-label';
