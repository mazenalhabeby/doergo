import type { OccurrenceEvidence, OccurrenceFix } from '@hbcfield/shared/client';

/**
 * The evidence of WHEN something happened, recorded at the tap.
 *
 * The phone's wall clock is a claim anyone can change. The check against it is
 * an anchor: the server's time from the last successful response, paired with a
 * MONOTONIC reading taken at that moment. `performance.now()` cannot be set by
 * the user; the gap between two readings is real elapsed time.
 *
 * ⚠️ `performance.now()` counts from app start, not boot, so an anchor is only
 * valid inside the process that took it. After a restart the evidence carries
 * no anchor until the first response, and the server marks it UNANCHORED —
 * informational, never an accusation. A native uptime clock would survive
 * restarts; this keeps the whole layer free of another native module.
 */
let anchor: { serverTime: string; uptimeMs: number } | null = null;

const monotonic = (): number =>
  typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();

/** Record the server's clock from a response header. */
export function noteServerTime(header: string | null | undefined): void {
  if (!header) return;
  const t = Date.parse(header);
  if (Number.isNaN(t)) return;
  anchor = { serverTime: new Date(t).toISOString(), uptimeMs: monotonic() };
}

/** Everything the server needs to judge when (and where) this happened. */
export function captureEvidence(fix?: OccurrenceFix | null, now: Date = new Date()): OccurrenceEvidence {
  return {
    occurredAt: now.toISOString(),
    uptimeMs: monotonic(),
    ...(anchor ? { anchor: { ...anchor } } : {}),
    ...(fix ? { fix } : {}),
  };
}

/** For tests. */
export function resetClockAnchor(): void {
  anchor = null;
}
