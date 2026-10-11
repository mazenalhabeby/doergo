import * as Location from 'expo-location';
import { keptCheckIns } from './kept-check-ins';
import { isUnreachable } from '../offline/actions/unreachable';
import * as TaskManager from 'expo-task-manager';
import { attendanceApi } from '../lib/api';
import { getAccessToken } from '../lib/api/client';
import { handleAutoRegionEvent } from './auto-clock/context';
import { AUTO_REGION_PREFIX, MAX_OS_REGIONS, MIN_OS_RADIUS_M, spaceOfRegion, type OsRegion } from './auto-clock/rules';

/**
 * Native OS geofencing — ONE task, two purposes, told apart by the region's name.
 *
 * THE RING (`ring:<spaceId>`, or a bare id armed by an older version): armed at
 * clock-in around the clocked-in space. Instead of polling GPS every 50 m / 5 min
 * (battery-heavy, laggy, and dead when the phone is idle in a pocket), the OS
 * hardware-monitors the region and wakes the app the moment the worker crosses
 * the boundary — even when the app is fully terminated — at near-zero battery
 * cost. It is only a WAKE TRIGGER: on enter/exit we send a normal heartbeat with
 * the current position, and the SERVER makes the precise in/out decision (real
 * radius + hysteresis) and drives the excursion state machine + push. The
 * periodic background heartbeat stays on as a backup and to re-check an APPROVED
 * grace timer's expiry (geofencing only fires on boundary crossings).
 *
 * THE AUTOMATIC CLOCK (`auto:<spaceId>`): the member's workspaces with a shift
 * today or tomorrow, armed from the plan (services/auto-clock). An enter or exit
 * goes to the automatic clock, which decides on the phone, offline.
 *
 * ⚠️ ONE TASK, BECAUSE `startGeofencingAsync` REPLACES THE WHOLE SET. Each purpose
 * changes only its own regions and re-arms the union; a clock-out removing the
 * ring must not switch the automatic clock off, and a plan refresh must not drop
 * the ring. The set is read back from the task's own options, so nothing else
 * has to remember it. At most MAX_OS_REGIONS (iOS's limit for the whole app),
 * and the ring is never the one left out.
 *
 * ⚠️ ARMING REPORTS WHERE THE PHONE ALREADY IS. Both platforms fire an ENTER or
 * EXIT for every region at the moment it is armed (iOS `requestStateForRegion`,
 * Android INITIAL_TRIGGER_ENTER|EXIT). Every handler here is safe to repeat,
 * and an unchanged set is not re-armed at all.
 */

const GEOFENCE_TASK = 'ATTENDANCE_GEOFENCE';
const RING_PREFIX = 'ring:';

const isAuto = (r: { identifier?: string }) => !!r.identifier?.startsWith(AUTO_REGION_PREFIX);

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[Geofence] task error:', error);
    return;
  }
  const eventType: number | undefined = data?.eventType;
  if (eventType == null) return;

  // The automatic clock's own regions decide on the phone (it checks the session itself).
  const autoSpace = spaceOfRegion(data?.region?.identifier);
  if (autoSpace) {
    await handleAutoRegionEvent(eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit', autoSpace, new Date());
    return;
  }

  // Keep alive across transient keychain read failures; stop only on real logout.
  let token: string | null;
  try {
    token = await getAccessToken();
  } catch {
    return;
  }
  if (!token) {
    await stopAllGeofences();
    return;
  }

  // The geofence event carries the region, not the device position — grab a fast
  // last-known fix (fall back to a fresh one) so the server can decide in/out.
  let pos = await Location.getLastKnownPositionAsync().catch(() => null);
  if (!pos) {
    pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
  }
  if (!pos) return;

  const point = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy || undefined,
    recordedAt: new Date(pos.timestamp ?? Date.now()).toISOString(),
  };
  // A ring crossing at a site with no signal is exactly the check-in worth keeping.
  if (!(await keptCheckIns.flush().catch(() => false))) {
    await keptCheckIns.keep(point);
    return;
  }
  try {
    await attendanceApi.heartbeat({ lat: point.lat, lng: point.lng, accuracy: point.accuracy });
  } catch (err) {
    if (isUnreachable(err)) {
      await keptCheckIns.keep(point);
      return;
    }
    console.error('[Geofence] heartbeat failed:', err);
  }
});

/**
 * The set to arm when one purpose replaces its own regions. Pure.
 * The ring goes first so the limit never cuts it.
 */
export function composeRegions(current: readonly OsRegion[], purpose: 'ring' | 'auto', replacement: readonly OsRegion[]): OsRegion[] {
  const ring = purpose === 'ring' ? replacement : current.filter((r) => !isAuto(r));
  const auto = purpose === 'auto' ? replacement : current.filter(isAuto);
  return [...ring, ...auto].slice(0, MAX_OS_REGIONS);
}

const key = (r: OsRegion) => `${r.identifier}|${r.latitude.toFixed(6)}|${r.longitude.toFixed(6)}|${Math.round(r.radius)}`;
function sameRegions(a: readonly OsRegion[], b: readonly OsRegion[]): boolean {
  if (a.length !== b.length) return false;
  const ka = a.map(key).sort();
  const kb = b.map(key).sort();
  return ka.every((k, i) => k === kb[i]);
}

async function armedRegions(): Promise<OsRegion[]> {
  if (!(await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK).catch(() => false))) return [];
  const options = await TaskManager.getTaskOptionsAsync<{ regions?: OsRegion[] }>(GEOFENCE_TASK).catch(() => null);
  return options?.regions ?? [];
}

/* One change at a time — the ring and the automatic clock arm from different places. */
let chain: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => undefined);
  return next;
}

/** Replace one purpose's regions and arm the union. True when that purpose's regions are armed. */
function replaceRegions(purpose: 'ring' | 'auto', replacement: OsRegion[]): Promise<boolean> {
  return oneAtATime(async () => {
    try {
      const current = await armedRegions();
      const next = composeRegions(current, purpose, replacement);
      if (sameRegions(current, next)) return replacement.length > 0;
      if (next.length === 0) {
        if (current.length) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => undefined);
        return false;
      }
      // Background permission is required for geofencing.
      const { status } = await Location.getBackgroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[Geofence] background permission not granted; skipping');
        return false;
      }
      if (current.length) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => undefined);
      await Location.startGeofencingAsync(GEOFENCE_TASK, next);
      console.log(`[Geofence] monitoring ${next.length} region(s)`);
      return replacement.length > 0;
    } catch (err) {
      console.error('[Geofence] failed to arm:', err);
      return false;
    }
  });
}

type GeofenceSpace = { id: string; lat?: number | null; lng?: number | null; geofenceRadius?: number | null };

/**
 * Start (or restart) geofencing around the clocked-in space's ring. No-op for a
 * logical space with no coordinates. Requires background ("Always") location —
 * the caller ensures that (startBackgroundHeartbeat already requests it).
 */
export async function startGeofenceForSpace(space: GeofenceSpace | null | undefined): Promise<boolean> {
  if (!space || space.lat == null || space.lng == null) {
    // No physical ring → nothing to monitor.
    await stopGeofence();
    return false;
  }
  return replaceRegions('ring', [
    {
      identifier: `${RING_PREFIX}${space.id}`,
      latitude: space.lat,
      longitude: space.lng,
      radius: Math.max(space.geofenceRadius ?? MIN_OS_RADIUS_M, MIN_OS_RADIUS_M),
      notifyOnEnter: true,
      notifyOnExit: true,
    },
  ]);
}

/** The shift is over: the ring goes. The automatic clock's regions stay armed. */
export async function stopGeofence(): Promise<void> {
  await replaceRegions('ring', []);
}

/** The automatic clock's regions (services/auto-clock/plan.ts), replacing the last set. */
export function setAutoClockRegions(regions: OsRegion[]): Promise<boolean> {
  return replaceRegions('auto', regions);
}

/** Everything off — the end of a session. */
export function stopAllGeofences(): Promise<void> {
  return oneAtATime(async () => {
    try {
      if (await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK)) {
        await Location.stopGeofencingAsync(GEOFENCE_TASK);
        console.log('[Geofence] stopped');
      }
    } catch (err) {
      console.error('[Geofence] failed to stop:', err);
    }
  });
}
