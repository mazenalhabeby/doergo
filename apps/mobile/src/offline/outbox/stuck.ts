import { OPEN_STATES } from './types';

/** Work waiting longer than this is worth telling the member about. */
export const STUCK_AFTER_MS = 24 * 60 * 60 * 1000;

/** The oldest unsent operation's age, when it has waited long enough to warn about; null otherwise. */
export function stuckFor(ops: readonly { state: string; createdAt: number }[], now: number): number | null {
  let oldest: number | null = null;
  for (const o of ops) {
    if (!OPEN_STATES.has(o.state as never)) continue;
    if (oldest === null || o.createdAt < oldest) oldest = o.createdAt;
  }
  return oldest !== null && now - oldest >= STUCK_AFTER_MS ? now - oldest : null;
}
