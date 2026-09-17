// Export all types
export * from './types';

// Export billing (plans, seat pricing, seat classifier)
export * from './billing';

// Export support (ticket/message types, per-tier SLA + priority helpers)
export * from './support';

// Export chat (member-to-member conversation/message types)
export * from './chat';

// Export customer-portal (B2B2C intake types, seed templates, helpers)
export * from './customer-portal';

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

// Export utility functions (for NestJS backend)
export * from './utils';

// Offline sync: occurrence evidence rules and the push/pull protocol
export * from './sync';

// IANA timezone → country name
export * from './timezone-country';

// Which narrated video explains which guided tour. Pure data; rendered by tools/video.
export * from './video-guides';

// Export crypto utilities (Node-only, not in client bundle)
export * from './utils/crypto';

// Platform-staff RBAC (permissions matrix)
export * from './platform/permissions';
export * from './platform/org-suspension';

// The single per-task authorization rule — pure, shared by every service.
export * from './access/space-routing';
export * from './access/task-access';
// Narrowing a query to the spaces a caller was granted — the other half of a
// guard that can only widen. See the file for why [] and null differ.
export * from './access/space-scope';
export * from './access/space-manage';
export * from './access/module-anywhere';
// Per-member reads: the same "is this person in my crew?" rule for the two
// services that ask it. NOT exported from client.ts — it needs a Prisma client.
export * from './access/member-scope';
export * from './access/assignment-window';
export * from './access/document-visibility';
export * from './access/cross-org-chat';
export * from './access/legacy-flag-migration';
export * from './access/workflow-modules';
export * from './access/workflow-validation';
export * from './access/workflow-template';
export * from './access/workflow-scope';
export * from './access/asset-kind-shape';

// Personnel file — document types, retention/credential rules and contract
// merge fields. Pure data + pure functions, so both entries carry it.
export * from './documents';

// Custody (who holds a thing, and when) and reading a receipt off a photo.
export * from './assets';

export * from './access/asset-kind-templates';
export * from './access/workflow-status-label';

// SMTP connection settings — one decision, both sending services.
export * from './mail/transport';
// Email words, per recipient language — templates, catalogue and the address
// lookup. Root entry only: nothing in a browser writes an email.
export * from './mail/email-messages';
export * from './mail/email-render';
export * from './mail/email-templates';
export * from './mail/email-locale';
// A client's language: what the office set, and the rule every client email follows.
export * from './crm/client-locale';
export * from './crm/client-filter';
export * from './crm/reminder';
export * from './crm/card-extras';
export * from './crm/card-merge';
export * from './mail/client-email-locale';

// One replica per scheduled job — see the note in the file.
export * from './scheduling/cron-lock';

// Bearer-secret helpers (node crypto — NOT client-safe, root entry only).
export * from './security/tokens';

// Push routing — see client.ts.
export * from './notifications/push-channels';
export * from './notifications/locale';
export * from './notifications/locale-format';
export * from './notifications/email-prefs';
// Report dataset and column names per language — see client.ts.
export * from './reports/report-labels';

// Counted time — see client.ts.
export * from './attendance/counted-time';

// Zoned time — see client.ts.
export * from './attendance/zoned-time';

// Break plan — see client.ts.
export * from './attendance/break-plan';

// Away policy — see client.ts.
export * from './attendance/away-policy';
// Clocking in with no shift: allow, limit per day, or shift only.
export * from './attendance/no-shift-limit';
// Where somebody on the clock is working now, from evidence — and which workspace to clock in at.
export * from './attendance/presence';
export * from './attendance/clock-in-choice';

// Cover — will there be enough people, and the right people. See client.ts.
export * from './attendance/cover';

// What should I work on next — one ordering, shared by the phone and the web.
export * from './tasks/my-work';
export * from './tasks/be-there';
