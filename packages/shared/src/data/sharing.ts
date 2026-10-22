/**
 * Published reads of auth-service's workspace-sharing table (`SpaceShare`) — see db.ts. Owner: auth-service.
 */
import type { On } from './db';

/** How many organizations a workspace is shared with right now. */
export function activeShareCount(db: On<'spaceShare', 'count'>, spaceId: string) {
  return db.spaceShare.count({ where: { spaceId, status: 'ACTIVE' } });
}
