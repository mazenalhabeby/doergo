import type { JwtPayload } from 'jsonwebtoken';

/**
 * A task as the emit helpers read it — only the fields that choose the rooms.
 * Everything else is passed to the clients exactly as it arrived.
 */
export type TaskPayload = {
  id?: string;
  organizationId?: string;
  spaceId?: string | null;
  assignedToId?: string | null;
} & Record<string, unknown>;

/** What a member's access token carries (auth-service signs it). */
export type AccessTokenClaims = JwtPayload & { userId?: string; role?: string; organizationId?: string };
