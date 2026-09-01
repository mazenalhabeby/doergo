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

// IANA timezone → country name
export * from './timezone-country';

// Export crypto utilities (Node-only, not in client bundle)
export * from './utils/crypto';

// Platform-staff RBAC (permissions matrix)
export * from './platform/permissions';

// The single per-task authorization rule — pure, shared by every service.
export * from './access/space-routing';
export * from './access/task-access';
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

export * from './access/asset-kind-templates';
export * from './access/workflow-status-label';

// SMTP connection settings — one decision, both sending services.
export * from './mail/transport';

// One replica per scheduled job — see the note in the file.
export * from './scheduling/cron-lock';

// Bearer-secret helpers (node crypto — NOT client-safe, root entry only).
export * from './security/tokens';
