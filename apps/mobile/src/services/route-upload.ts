import { trackingApi, ApiError } from '../lib/api';
import { sessionOwnerId } from '../lib/api/client';
import { createRouteBuffer, type FlushPoint, type PendingBurst } from './route-buffer';
import { sealedStore } from '../lib/sealed-stores';

/** Sending route points, and holding the ones a dead zone kept back — moved here unchanged from background-route-tracking.ts. */
// Largest request the server accepts (BatchTrackingLocationDto).
export const BATCH_MAX_POINTS = 500;

// Ceiling on what we hold without signal: at ~20 m per point about 100 km of
// route, under 1 MB on the phone. Past it the OLDEST points go, because the
// recent ones describe where the member is now.
export const MAX_PENDING_POINTS = 5000;

// A burst older than this is not sent. Two working days: the server files a
// late point only inside its own route's start-to-arrival window, so an old
// point cannot muddy another route — but a long dead zone must still land.
export const MAX_PENDING_AGE_MS = 48 * 60 * 60 * 1000;

// Flips to true once we learn the batch endpoint isn't available (older server)
// so we stop paying a guaranteed-failing batch request before each fallback.
// Module-scoped: persists while the tracking session's process is alive.
let batchUnsupported = false;

/*
  ⚠️ SEALED PER MEMBER (lib/secure-buffer.ts). The points used to sit in
  AsyncStorage as plain JSON — readable from a backup. The first touch per
  process re-seals whatever an older version left in plaintext, in place, so
  points held across the update still go up.
*/
export const routeStore = (owner: string) => sealedStore('route', owner);

export const held = createRouteBuffer(routeStore, { maxPoints: MAX_PENDING_POINTS, maxAgeMs: MAX_PENDING_AGE_MS });

/**
 * Send one burst. Returns the points still undelivered — empty means the server
 * has them.
 *
 * Prefers the single batch request; if the server doesn't have that endpoint
 * (404) it switches to per-point uploads for the rest of the session so
 * tracking keeps working against an older backend. Order is preserved
 * (sequential) to keep route distance accurate.
 */
/** Worth trying again later: no connection, a timeout, the server busy or limiting, or a login being refreshed. */
export function retryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  const c = err.statusCode;
  return c === 0 || c === 401 || c === 408 || c === 429 || c >= 500;
}

export async function sendBurst(taskId: string | undefined, points: FlushPoint[]): Promise<FlushPoint[]> {
  if (!batchUnsupported) {
    // ≤500 per request — a long dead zone goes up as a few requests, never one per point.
    for (let at = 0; at < points.length; at += BATCH_MAX_POINTS) {
      const chunk = points.slice(at, at + BATCH_MAX_POINTS);
      try {
        await trackingApi.updateLocationBatch({ taskId, points: chunk });
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) {
          // Endpoint missing (an older server) — downgrade and send the rest one by one.
          batchUnsupported = true;
          return sendOneByOne(taskId, points.slice(at));
        }
        if (retryable(err)) {
          // Offline, rate-limited, or a server fault — keep this chunk and the rest.
          console.warn('[Route] Batch not delivered, will retry:', err);
          return points.slice(at);
        }
        // The server understood and refused (not on this job any more, bad
        // data): retrying can only fail the same way, so this chunk goes.
        console.warn('[Route] Burst rejected, discarding:', (err as ApiError).statusCode);
      }
    }
    return [];
  }
  return sendOneByOne(taskId, points);
}

/** Older servers only. Stops at the first point that should be retried and keeps it and everything after. */
export async function sendOneByOne(taskId: string | undefined, points: FlushPoint[]): Promise<FlushPoint[]> {
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    try {
      await trackingApi.updateLocation({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, taskId });
    } catch (err) {
      if (retryable(err) || (err instanceof ApiError && err.statusCode === 404)) return points.slice(i);
      console.warn('[Route] Point rejected, discarding:', (err as ApiError).statusCode);
    }
  }
  return [];
}

/**
 * Upload a burst, and any earlier bursts that couldn't be delivered.
 *
 * Field members drive through tunnels, underground garages and dead zones.
 * Before this, a burst that failed was simply gone: the route drew a straight
 * line across the gap — the exact defect background tracking was built to fix,
 * reappearing wherever coverage is worst. Failed bursts are now held and sent
 * with the next successful flush.
 *
 * Never throws: the headless task cannot handle an exception.
 */
let flushing: Promise<void> | null = null;

export async function flushPoints(taskId: string | undefined, points: FlushPoint[]): Promise<void> {
  // One flush at a time in this JS context: two overlapping ones would send the
  // same held bursts twice.
  while (flushing) await flushing.catch(() => undefined);
  flushing = flushQueue(points.length ? [{ taskId, points }] : []);
  try {
    await flushing;
  } finally {
    flushing = null;
  }
}

export async function flushQueue(fresh: PendingBurst[]): Promise<void> {
  // Whose points these are: the member the token belongs to. Nobody → nothing is sent or kept.
  const owner = await sessionOwnerId();
  if (!owner) return;
  // What was held goes first, oldest first; one failure means the connection is
  // down, and trying the rest would only hold the radio up for nothing.
  const allHeldSent = await held.drain(owner, (b) => sendBurst(b.taskId, b.points), BATCH_MAX_POINTS);
  if (!allHeldSent) {
    await held.append(owner, fresh);
    return;
  }
  const remaining: PendingBurst[] = [];
  for (let i = 0; i < fresh.length; i++) {
    const left = await sendBurst(fresh[i].taskId, fresh[i].points);
    if (left.length) {
      remaining.push({ taskId: fresh[i].taskId, points: left }, ...fresh.slice(i + 1));
      break;
    }
  }
  await held.append(owner, remaining);
}
