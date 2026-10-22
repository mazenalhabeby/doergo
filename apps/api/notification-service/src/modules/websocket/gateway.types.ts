import type { SocketAccess } from './socket-access';

// Moved here unchanged from websocket.gateway.ts (re-exported there).

export interface ClientInfo {
  userId: string;
  role: string;
  organizationId: string;
  connectedAt: Date;
  rooms: string[];
  /** Access resolved from the database (not the token's claims) and when. */
  access?: SocketAccess;
  accessAt?: number;
  /** The token's `iat` (seconds), checked against the account's session cut-off on every re-read. */
  tokenIat?: number;
  /** The chat conversation on this screen right now (a member of it, checked) — no push for it. */
  viewingConversationId?: string | null;
}

/**
 * Revocation events this gateway listens for (socket-events.controller.ts).
 * Emitted by the auth service; the names are a contract — change both sides.
 *
 *   'user_removed'            { userId, organizationId }  removed from the org
 *   'user_sessions_revoked'   { userId }                  deactivated / signed out everywhere / password reset
 *   'organization_suspended'  { organizationId }          the operator's off switch
 *
 * A socket authenticates ONCE; without these it would keep receiving the
 * organization's live events until it happened to drop.
 */
export const SOCKET_REVOCATION_EVENTS = {
  USER_REMOVED: 'user_removed',
  USER_SESSIONS_REVOKED: 'user_sessions_revoked',
  ORGANIZATION_SUSPENDED: 'organization_suspended',
} as const;

/** How long a resolved access is trusted on a socket before a task join re-reads it. */
export const ACCESS_TTL_MS = 60_000;
/**
 * Grace after the token's `exp` before the transport is cycled — time for the
 * client's own refresh to land, so the reconnect presents the NEW token.
 */
export const EXPIRY_GRACE_MS = 30_000;
/** setTimeout's ceiling (~24.8 days); a longer wait is re-armed when it fires. */
export const MAX_TIMER_MS = 2_147_483_647;

export interface SocketStats {
  totalConnections: number;
  authenticatedClients: number;
  connectionsByRole: Record<string, number>;
  connectionsByOrg: Record<string, number>;
  messagesReceived: number;
  messagesSent: number;
  uptime: number;
}
