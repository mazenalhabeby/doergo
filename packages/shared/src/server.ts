/**
 * @hbcfield/shared/server — what only the services load: Nest modules, guards and decorators, Prisma,
 * queues, mail sending, crypto, and rules that read the database. Never imported by the web app or the phone.
 *
 * Everything the apps may load lives in ./client. The package root (./index) is exactly client + server,
 * so the two lists can no longer drift apart (docs/plans/code-structure-fix.md, Phase 2.1).
 */
export * from './billing/rate-writer';

// Export Prisma module (for NestJS backend)
export * from './prisma';

// Export microservices utilities (for NestJS backend)
export * from './microservices';

// Export API utilities (for NestJS backend)
export * from './api';
// Records a phone names: created once however often they are sent (server-only)
export * from './records';

// Export shared constants (for NestJS backend)
export * from './constants';

// Export shared validators (for NestJS backend)
export * from './validators';

// Export shared decorators (for NestJS backend)
export * from './decorators';

// Export shared guards (for NestJS backend)
export * from './guards';

// Export queue utilities (for NestJS backend)
export * from './queues';

// Export crypto utilities (Node-only, not in client bundle)
export * from './utils/crypto';

export * from './platform/org-suspension';

// The single per-task authorization rule — pure, shared by every service.
export * from './access/space-routing';
// Per-member reads: the same "is this person in my crew?" rule for the two
// services that ask it. NOT exported from client.ts — it needs a Prisma client.
export * from './access/member-scope';
export * from './access/found-in-org';
export * from './access/assignment-window';
export * from './access/document-visibility';

// SMTP connection settings — one decision, both sending services.
export * from './mail/transport';
// Email words, per recipient language — templates, catalogue and the address
// lookup. Root entry only: nothing in a browser writes an email.
export * from './mail/email-messages';
export * from './mail/email-render';
export * from './mail/email-templates';
export * from './mail/email-locale';
// May this member reach this client — the CRM's rule, for other services (crm/client-reach.ts).
export * from './crm/client-reach';
export * from './mail/client-email-locale';
// Who a scheduled report may be sent to: real addresses, de-duplicated, at most 20.
export * from './mail/recipients';

// One replica per scheduled job — see the note in the file.
export * from './scheduling/cron-lock';

// Bearer-secret helpers (node crypto — NOT client-safe, root entry only).
export * from './security/tokens';

export * from './notifications/locale-format';

// The overtime-request flow's pushes as catalogue references (attendance/overtime-notice.ts).
export * from './attendance/overtime-notice';

export * from './tasks/open-role-holder';
// A job somebody is working on right now — narrower than ACTIVE_STATUSES (tasks/working-statuses.ts).
export * from './tasks/working-statuses';
export * from './api/clamp-limit';

// Constant-time secret comparison (node-only — root entry, never client.ts).
export * from './security/safe-equal';
// A request URL with its bearer secrets removed, for logs.
export * from './security/redact-url';
// What a request body may change on a unit — one whitelist for every route.
export * from './customer-portal/unit-fields';
// Account guards: who may take over / grant / lock an account (security/account-guards.ts)
export * from './security/account-guards';
// One loader for a member's org-wide permission ceiling (security/org-permission-ceiling.ts)
export * from './security/org-permission-ceiling';
// Built-in roles follow their definition, additively, until an admin edits them (access/builtin-role-sync.ts)
export * from './access/builtin-role-sync';
// The permission keys a role may carry, org-wide or in a space — one list for both services (access/permission-whitelist.ts)
export * from './access/permission-whitelist';
// Every permission as an org-wide request field, bridges applied (access/org-flags.ts)
export * from './access/org-flags';
// A member's org-wide access from their row, resolved like the session (access/org-access.ts).
export * from './access/org-access';
// A stand-in: a leader's approval decisions handed over for whole days (access/delegation.ts).
export * from './access/delegation';

export * from './testing';

// The assignment-permissions reader/writer (the apps only take its types, from ./client).
export * from './access/assignment-permissions';

// Published reads of another service's tables (code-structure-fix 3.4) — see data/db.ts.
export * from './data/db';
export * from './data/members';
export * from './data/jobs';
export * from './data/workspaces';
export * from './data/invoicing';
export * from './data/member-work';
export * from './data/people';
export * from './data/organizations';
export * from './data/roles';
export * from './data/access';
export * from './data/clients';
export * from './data/support';
export * from './data/sharing';
export * from './data/leave';
export * from './data/documents';
export * from './data/activity';
export * from './data/people-work';
export * from './data/chat-contacts';
