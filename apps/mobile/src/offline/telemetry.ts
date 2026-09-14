import type { SyncTelemetry } from '@hbcfield/shared/client';
import { APP_VERSION, fetchWithAuth } from '../lib/api/client';
import { ATTENTION_STATES, OPEN_STATES, type OutboxOp } from './outbox/types';

/** At most one report in this long; the latest replaces the last on the server anyway. */
export const TELEMETRY_EVERY_MS = 10 * 60 * 1000;

/**
 * How this phone's queue is doing, for the office's device health and the
 * alerts. Counts, ages and error codes — never what the work is.
 */
export function buildTelemetry(
  ops: readonly OutboxOp[],
  files: { count: number; bytes: number },
  lastSuccessAt: number | null,
  appVersion: string,
): SyncTelemetry {
  const byState: Record<string, number> = {};
  const codes: Record<string, number> = {};
  let waiting = 0;
  let attention = 0;
  let oldestWaitingAt: number | null = null;
  for (const o of ops) {
    byState[o.state] = (byState[o.state] ?? 0) + 1;
    if (OPEN_STATES.has(o.state)) {
      waiting++;
      if (oldestWaitingAt === null || o.createdAt < oldestWaitingAt) oldestWaitingAt = o.createdAt;
    }
    if (ATTENTION_STATES.has(o.state)) attention++;
    const code = o.lastError?.code;
    if (code && (OPEN_STATES.has(o.state) || ATTENTION_STATES.has(o.state))) codes[code] = (codes[code] ?? 0) + 1;
  }
  return { appVersion, waiting, attention, oldestWaitingAt, byState, codes, filesWaiting: files.count, bytesWaiting: files.bytes, lastSuccessAt };
}

let lastSentAt = 0;

/** Report, unless a report went recently. Never throws — monitoring must not cost the member anything. */
export async function reportTelemetry(
  source: { operations(): readonly OutboxOp[]; snapshot(): { lastSuccessAt: number | null } },
  files: { totals(): Promise<{ count: number; bytes: number }> },
  now = Date.now(),
): Promise<void> {
  if (now - lastSentAt < TELEMETRY_EVERY_MS) return;
  lastSentAt = now;
  try {
    const body = buildTelemetry(source.operations(), await files.totals(), source.snapshot().lastSuccessAt, APP_VERSION);
    await fetchWithAuth('/sync/telemetry', { method: 'POST', body: JSON.stringify(body) });
  } catch {
    /* next time */
  }
}
