import type { OutboxOp } from './types';

/**
 * Changes that cancel each other out before they were ever sent.
 *
 * An ALLOW-LIST, deliberately short: only changes that are pure "set this
 * value". Clock-ins, status changes, notes and photos are never touched — each
 * is evidence of something that happened, at a time.
 *
 *  - profile.update, repeated: the NEWEST one carries the latest value of every
 *    field and the older ones go (Busy → Away → Busy sends one request, not
 *    three). Safe even if an older one reached the server on a lost answer: the
 *    survivor restates every field, so the end state is the same. The survivor
 *    itself must never have been attempted — its body changes, and an attempted
 *    body resent under the same Idempotency-Key is refused as a different
 *    request.
 *  - timeOff.request then timeOff.cancel of it, neither ever attempted: nothing
 *    at all. Once the request has been attempted it may be at the office, so
 *    both go, in order.
 *
 * Returns only the operations it changed, ready to save. Pure.
 */
export function compact(ops: readonly OutboxOp[], now: number): OutboxOp[] {
  const dependedOn = new Set(ops.flatMap((o) => o.dependsOn));
  const untouched = (o: OutboxOp) => o.state === 'pending' && o.attempts === 0 && !dependedOn.has(o.id);
  // Waiting and not being sent right now; may have been attempted.
  const waiting = (o: OutboxOp) => (o.state === 'pending' || o.state === 'retry' || o.state === 'awaiting_auth') && !dependedOn.has(o.id);
  const changed = new Map<string, OutboxOp>();
  const discard = (o: OutboxOp) => changed.set(o.id, { ...o, state: 'discarded', updatedAt: now });

  // Repeated profile changes, per member lane, oldest first.
  const byLane = new Map<string, OutboxOp[]>();
  for (const o of ops) {
    if (o.op !== 'profile.update' || !waiting(o)) continue;
    byLane.set(o.lane, [...(byLane.get(o.lane) ?? []), o]);
  }
  for (const group of byLane.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.createdAt - b.createdAt);
    const last = group[group.length - 1]!;
    if (!untouched(last)) continue;
    const body = Object.assign({}, ...group.map((o) => (o.payload.body ?? {}) as Record<string, unknown>));
    group.slice(0, -1).forEach(discard);
    changed.set(last.id, { ...last, payload: { ...last.payload, body }, updatedAt: now });
  }

  // A request withdrawn before it was sent.
  const requests = new Map<string, OutboxOp>();
  for (const o of ops) {
    const id = (o.payload.body as { id?: unknown } | undefined)?.id;
    if (o.op === 'timeOff.request' && untouched(o) && typeof id === 'string') requests.set(id, o);
  }
  for (const o of ops) {
    if (o.op !== 'timeOff.cancel' || !untouched(o)) continue;
    const request = requests.get(o.payload.params?.timeOffId ?? '');
    if (request && request.createdAt <= o.createdAt) {
      discard(request);
      discard(o);
    }
  }

  return [...changed.values()];
}
