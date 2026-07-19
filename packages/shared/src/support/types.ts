/**
 * Support system — shared, client-safe types & constants.
 *
 * These string-literal unions mirror the Prisma enums in the auth-service schema
 * (SupportStatus / SupportCategory / SupportChannel / SupportAuthorType). Keep the
 * two in sync — this file is the single source consumed by web + mobile + backend.
 */

export const SUPPORT_STATUSES = [
  'OPEN', // new, no agent reply yet
  'PENDING_AGENT', // waiting on us (customer replied last)
  'PENDING_CUSTOMER', // waiting on the customer (agent replied last)
  'RESOLVED', // agent marked solved (customer can reopen)
  'CLOSED', // archived
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/** Statuses an agent still needs to act on (drives the inbox + unresolved counts). */
export const SUPPORT_OPEN_STATUSES: SupportStatus[] = ['OPEN', 'PENDING_AGENT', 'PENDING_CUSTOMER'];

export const SUPPORT_CATEGORIES = ['BILLING', 'TECHNICAL', 'HOWTO', 'FEEDBACK', 'OTHER'] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CHANNELS = ['WEB', 'MOBILE', 'EMAIL', 'LIVE_CHAT'] as const;
export type SupportChannel = (typeof SUPPORT_CHANNELS)[number];

export const SUPPORT_AUTHOR_TYPES = ['CUSTOMER', 'AGENT', 'SYSTEM'] as const;
export type SupportAuthorType = (typeof SUPPORT_AUTHOR_TYPES)[number];

export interface SupportAttachment {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorId: string | null; // null for SYSTEM
  authorType: SupportAuthorType;
  body: string;
  attachments: SupportAttachment[];
  isInternalNote: boolean; // agent-only private note; never sent to the customer
  readByCustomerAt: string | null;
  readByAgentAt: string | null;
  createdAt: string;
  // Hydrated for display (optional):
  author?: { id: string; firstName: string; lastName: string; avatarUrl?: string | null } | null;
}

export interface SupportTicket {
  id: string;
  organizationId: string;
  createdById: string;
  subject: string;
  category: SupportCategory;
  channel: SupportChannel;
  status: SupportStatus;
  priority: number; // lower = served first (derived from tier at creation)
  planTierAtCreation: string | null;
  assignedAgentId: string | null;
  slaFirstResponseDueAt: string | null;
  firstRespondedAt: string | null;
  slaBreached: boolean;
  lastCustomerMessageAt: string | null;
  lastAgentMessageAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Hydrated for display (optional):
  createdBy?: { id: string; firstName: string; lastName: string; email?: string; avatarUrl?: string | null } | null;
  messages?: SupportMessage[];
  unreadForCustomer?: number;
  unreadForAgent?: number;
}

// ── display helpers (pure) ───────────────────────────────────────────────────
export function isSupportOpen(status: SupportStatus): boolean {
  return SUPPORT_OPEN_STATUSES.includes(status);
}
