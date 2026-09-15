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

// Offline sync: occurrence evidence rules and the push/pull protocol — pure, client-safe
export * from './sync';

// Export utility functions (date, query string building)
export * from './utils';
// Reading a business card — pure rules, runs on the phone.
export * from './crm/business-card';

// IANA timezone → country name (for attendance display labels)
export * from './timezone-country';

// Client-safe constants (pure data — no server deps)
export * from './constants/attendance';
// Task status vocabulary and the overdue rule. Pure data + pure functions, and
// the client needs them: every task view asks "is this finished / overdue?".
export * from './constants/task';
// The single per-task authorization rule — pure, shared by every service.
export * from './access/task-access';
// Narrowing a query to the spaces a caller was granted — the other half of a
// guard that can only widen. See the file for why [] and null differ.
export * from './access/space-scope';
// Who may configure a space, and add people to it — asked by web and mobile alike.
export * from './access/space-manage';

// Code lengths and charsets for invitations and org join codes. Pure data, and
// the CLIENTS are what need them: the inputs that receive a code cap their
// length, and a cap that does not track the generator silently truncates a
// valid code and reports it as invalid. Both apps import these; neither may
// import the root entry, which carries Node-only crypto.
export * from './constants/invitation';
export * from './constants/onboarding';
// …and the helper that tells the two apart, because the person typing cannot:
// both onboarding cards say "code", so each entry screen receives the other's.
export * from './constants/join-code';

// Personnel file — document types, retention/credential rules and contract
// merge fields. Pure data + pure functions, so both entries carry it.
export * from './documents';

// Custody periods and the receipt reader. Pure, and the phone runs both: it
// decides what a photograph said and what a handover would do BEFORE anything
// is sent, so the screen and the server cannot disagree about either.
export * from './assets';

// Role helpers (isAdmin, hasRole, …). The PURE module, not `guards/index`,
// which re-exports NestJS guard classes. The client needs isAdmin so its
// permission gate can agree with PermissionsGuard rather than approximate it.
export * from './guards/role-helpers';

export * from './access/cross-org-chat';
export * from './access/legacy-flag-migration';
export * from './access/workflow-modules';
export * from './access/workflow-validation';
export * from './access/workflow-template';
export * from './access/workflow-scope';
export * from './access/asset-kind-shape';
export * from './access/asset-kind-templates';
export * from './access/workflow-status-label';

// Push routing (Android channel ids + iOS interruption level). Shared because
// the server names the channel and the app creates it — the two cannot drift.
export * from './notifications/push-channels';
export * from './notifications/locale';
// What a client record's "Language for emails" may hold — the form and the server share it.
export * from './crm/client-locale';

// Counted time — the one place real hours become paid hours.
export * from './attendance/counted-time';

// Wall-clock time in a place, as an absolute instant.
export * from './attendance/zoned-time';

// Planned rests: rules → one shift's plan, and the state it moves through.
export * from './attendance/break-plan';

// Working away from a site: a ceiling on the workspace, a grant on the person.
export * from './attendance/away-policy';
// Clocking in with no shift: allow, limit per day, or shift only.
export * from './attendance/no-shift-limit';
// Where somebody on the clock is working now, from evidence — and which workspace to clock in at.
export * from './attendance/presence';
export * from './attendance/clock-in-choice';

// Cover: enough people, and the right people — the leave chart, the approval
// verdict and the live floor panel all read this one rule.
export * from './attendance/cover';

// What should I work on next — one ordering, shared by the phone and the web.
export * from './tasks/my-work';
export * from './tasks/be-there';
