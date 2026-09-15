import { outcomeOf, type ActionOutcome } from '../actions/outcome';
import type { SyncEngine } from '../sync-engine';

/** What a member changes about themselves from the phone. */
export interface OwnProfilePatch {
  firstName?: string;
  lastName?: string;
  presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | null;
  timeFormat?: '12h' | '24h';
  /** The language pushes are written in — see apps/api/notification-service/src/i18n. */
  locale?: string;
}

/**
 * Change your own profile, with or without signal.
 *
 * One lane per member, so changes arrive in the order they were made and the
 * last one is what the server keeps; consecutive ones are merged before sending
 * (see outbox/compaction.ts), so switching Busy → Away → Busy in a basement
 * sends one change, not three.
 */
export async function updateOwnProfile(engine: SyncEngine, memberId: string, patch: OwnProfilePatch): Promise<ActionOutcome> {
  const op = await engine.enqueueAndSettle({
    op: 'profile.update',
    lane: `profile:${memberId}`,
    entityId: memberId,
    payload: { body: { ...patch } },
  });
  return outcomeOf(engine, op);
}
