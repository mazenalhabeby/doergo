// Export all types
export * from './types';

// Export billing (plans, seat pricing, seat classifier)
export * from './billing';
export * from './billing/rate-writer';

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
export * from './assigned-home';
export * from './tracking/route-points';

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
// Who may read a workspace's roster, and see a member's terms there.
export * from './access/roster-access';
export * from './access/document-visibility';
export * from './access/cross-org-chat';
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
// Step forms — what a workflow step asks when a job moves into it. Pure; phone, web and server judge alike.
export * from './workflows/step-form';


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
// May this member reach this client — the CRM's rule, for other services (crm/client-reach.ts).
export * from './crm/client-reach';
export * from './crm/contact-keys';
export * from './crm/card-extras';
export * from './crm/card-merge';
export * from './mail/client-email-locale';
// Who a scheduled report may be sent to: real addresses, de-duplicated, at most 20.
export * from './mail/recipients';

// One replica per scheduled job — see the note in the file.
export * from './scheduling/cron-lock';

// Bearer-secret helpers (node crypto — NOT client-safe, root entry only).
export * from './security/tokens';

// Push routing — see client.ts.
export * from './notifications/push-channels';
export * from './notifications/locale';
export * from './notifications/locale-format';
export * from './app-release/release-notes';
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
// The rota — who works which shift which day — read by the clock-in and the Schedules page.
export * from './attendance/rota';
// The overtime-request flow's pushes as catalogue references (attendance/overtime-notice.ts).
export * from './attendance/overtime-notice';

// What should I work on next — one ordering, shared by the phone and the web.
export * from './tasks/my-work';
export * from './tasks/role-pool';
export * from './tasks/open-role-holder';
export * from './calendar';
export * from './tasks/be-there';
export * from './tasks/clock-gate';
export * from './tasks/handover';
export * from './tasks/job-time';
export * from './tasks/crew';
export * from './tasks/checklist';
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
// A person's name as one line, never "John null" (people/person-name.ts).
export * from './people/person-name';
// The permission keys a role may carry, org-wide or in a space — one list for both services (access/permission-whitelist.ts)
export * from './access/permission-whitelist';
// A member's org-wide access from their row, resolved like the session (access/org-access.ts).
export * from './access/org-access';
// What a member may upload, and how big — one definition (constants/upload-rules.ts).
export * from './constants/upload-rules';
