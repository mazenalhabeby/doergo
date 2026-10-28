/* The home strip's approvals read, without React — so the deadline is tested on its own. */
import type { ApprovalsCount } from '@hbcfield/shared/client';

/** The longest the home strip waits for the approvals read before showing what it has. */
export const APPROVALS_READY_AFTER_MS = 1500;

export type WaitingState = { count: number; ready: boolean };

/** What can be acted on now; an older server sends no `actionable` — then its total. */
export const actionableOf = (x: Pick<ApprovalsCount, 'total'> & { actionable?: number }): number =>
  Math.max(0, x.actionable ?? x.total ?? 0);

/**
 * Read the count, but never hold the strip back: `ready` turns true when the answer (or a failure) arrives, or after
 * `afterMs` at the latest — the count then follows when the read lands. The approvals read is a fan-out over every
 * kind; a work-blocking reminder (a document to sign) must not wait for it. Returns the cancel for the focus effect.
 */
export function watchApprovalsCount(
  read: () => Promise<Pick<ApprovalsCount, 'total'> & { actionable?: number }>,
  set: (next: (prev: WaitingState) => WaitingState) => void,
  afterMs = APPROVALS_READY_AFTER_MS,
): () => void {
  let live = true;
  const timer = setTimeout(() => live && set((prev) => (prev.ready ? prev : { ...prev, ready: true })), afterMs);
  const settle = (count: number) => {
    clearTimeout(timer);
    if (live) set(() => ({ count, ready: true }));
  };
  read().then(
    (x) => settle(actionableOf(x)),
    () => settle(0),
  );
  return () => {
    live = false;
    clearTimeout(timer);
  };
}
