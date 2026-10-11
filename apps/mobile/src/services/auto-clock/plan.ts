import * as Location from 'expo-location';
import { isAtSite, parseGeofencePolygon, type AutoClockPlan } from '@hbcfield/shared/client';
import { attendanceApi } from '../../lib/api/attendance';
import { ApiError } from '../../lib/api';
import { getFix } from '../../lib/location-fix';
import { isUnreachable } from '../../offline/actions/unreachable';
import { liveEngineFor } from '../../offline/live-engine';
import { setAutoClockRegions } from '../background-geofence';
import { ensureBackgroundLocation } from '../background-permission';
import { autoClockWake, handleAutoRegionEvent } from './context';
import { autoClockNotifier } from './notifications';
import { MAX_OS_REGIONS, autoRegionId, selectAutoRegions } from './rules';
import { serially, standDown } from './runner';
import { autoClockStore, type AutoClockState } from './store';

/**
 * Change the stored record in the same queue the geofence handlers write it in —
 * a refresh that loaded it before a network call and saved it after would
 * otherwise put back the visits an ENTER recorded in between.
 */
function updateState(userId: string, change: (s: AutoClockState) => void): Promise<AutoClockState> {
  return serially(async () => {
    const s = await autoClockStore.load(userId);
    change(s);
    await autoClockStore.save(userId, s);
    return s;
  });
}

/*
  THE AUTOMATIC CLOCK'S PLAN — fetched, kept, armed; and the member's consent.

  The plan says where the member is chosen and when their shifts are, today and
  tomorrow. It is fetched whenever the app starts or returns, kept in the sealed
  store so the geofence task decides offline, and turned into OS regions.

  ⚠️ NO CONSENT, NOTHING ARMED. The server sends no places without consent, and
  the phone checks again: a withdrawn consent disarms on the spot, even with no
  signal (the server is told on the next refresh).

  ⚠️ AN OLDER SERVER ANSWERS 404 — the feature is simply not there: nothing is
  armed and the setting is not shown.
*/

/** What the setting on the Time tab draws. */
export interface AutoClockStatus {
  /** unknown: not asked yet · no: the server does not have it · engine: this phone cannot run it (no offline layer). */
  availability: 'unknown' | 'yes' | 'no' | 'engine';
  consentAt: string | null;
  /** Workspaces in the plan (where the member is chosen). */
  places: number;
  /** Workspaces actually watched by the OS now. */
  armed: number;
  /** Background ("Always") location. */
  background: 'granted' | 'missing' | 'unknown';
}

const INITIAL: AutoClockStatus = { availability: 'unknown', consentAt: null, places: 0, armed: 0, background: 'unknown' };
let status: AutoClockStatus = INITIAL;
const listeners = new Set<() => void>();
function publish(next: Partial<AutoClockStatus>) {
  status = { ...status, ...next };
  listeners.forEach((l) => l());
}
export const autoClockStatus = {
  get: () => status,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

/* One refresh at a time — start-up, resume and the toggle can all ask together. */
let refreshing: Promise<void> | null = null;

/** A fix fresh enough to say "you are inside right now" when arming — never a stale one from hours ago. */
const ARMING_FIX_MAX_AGE_MS = 2 * 60_000;

/**
 * Fetch the plan, keep it, arm (or disarm) the OS regions, then look again.
 * Never throws — it runs on every start and return of the app.
 */
export function refreshAutoClock(member: { userId: string; organizationId: string }): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const before = await autoClockStore.load(member.userId);
    let withdrawPending = !!before.withdrawPending;

    // Switched off with no signal: say so now, before anything else.
    if (withdrawPending) {
      try {
        await attendanceApi.autoClockConsent(false);
        withdrawPending = false;
      } catch {
        /* still pending — and still disarmed below */
      }
    }

    let plan: AutoClockPlan | null = before.plan;
    let available = before.available;
    try {
      plan = await attendanceApi.autoClockPlan();
      available = true;
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        available = false;
        plan = null;
      } else if (!isUnreachable(err) && !(err instanceof ApiError && err.statusCode >= 500)) {
        // Refused (no clock module for this person, no longer a member): arm nothing.
        plan = null;
      }
      // Unreachable, or the server having a bad moment: keep arming from the plan the phone has.
    }
    const state = await updateState(member.userId, (s) => {
      s.organizationId = member.organizationId;
      s.available = available;
      s.plan = plan;
      // The server now knows of the withdrawal this refresh found; one made meanwhile stays pending.
      if (before.withdrawPending && !withdrawPending) s.withdrawPending = false;
    });

    const engine = liveEngineFor(member.userId)?.engine ?? null;
    const consented = !!plan?.consentAt && !state.withdrawPending;
    publish({
      availability: state.available === false ? 'no' : state.available ? (engine ? 'yes' : 'engine') : status.availability,
      consentAt: state.withdrawPending ? null : plan?.consentAt ?? null,
      places: plan?.places.length ?? 0,
    });

    if (!consented || !engine || !plan?.places.length) {
      await disarm(member.userId);
      return;
    }

    const { status: bg } = await Location.getBackgroundPermissionsAsync().catch(() => ({ status: 'undetermined' as const }));
    publish({ background: bg === 'granted' ? 'granted' : 'missing' });
    if (bg !== 'granted') {
      await setAutoClockRegions([]);
      publish({ armed: 0 });
      return;
    }

    const here = await getFix({ purpose: 'nearby' }).catch(() => null);
    const origin = here ? { lat: here.coords.latitude, lng: here.coords.longitude } : null;
    // One region is kept for the shift's own ring (background-geofence.ts).
    const regions = selectAutoRegions(plan.places, { now: new Date(), origin, max: MAX_OS_REGIONS - 1 });
    await setAutoClockRegions(regions);
    publish({ armed: regions.length });

    /*
      Already inside when the regions are armed: the OS reports it too, but only
      when the set changed — so a fresh fix inside a watched site counts as an
      arrival now (the handlers keep the FIRST moment, so this never moves it).
    */
    if (here && Date.now() - here.timestamp <= ARMING_FIX_MAX_AGE_MS) {
      for (const p of plan.places) {
        if (!regions.some((r) => r.identifier === autoRegionId(p.spaceId))) continue;
        const zone = { lat: p.lat, lng: p.lng, geofenceRadius: p.radius, geofencePolygon: parseGeofencePolygon(p.polygon ?? null) };
        if (isAtSite({ lat: here.coords.latitude, lng: here.coords.longitude, accuracy: here.coords.accuracy ?? undefined }, zone).inside) {
          await handleAutoRegionEvent('enter', p.spaceId, new Date());
        }
      }
    }
    await autoClockWake({ checkShift: true });
  })()
    .catch(() => undefined)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function disarm(userId: string): Promise<void> {
  await setAutoClockRegions([]);
  await standDown({ userId, engine: liveEngineFor(userId)?.engine ?? null, store: autoClockStore, notifier: autoClockNotifier });
  publish({ armed: 0 });
}

export type ConsentResult = 'on' | 'off' | 'offline' | 'failed' | 'needs-always';

/**
 * The member's own yes or no.
 *
 * Yes needs a connection — it is a consent the server records, with its time.
 * No works anywhere: the phone stops at once and tells the server when it can.
 * "Always" location is asked only AFTER the yes, through the same disclosure
 * as the shift heartbeat.
 */
export async function setAutoClockConsent(member: { userId: string; organizationId: string }, consent: boolean): Promise<ConsentResult> {
  // A refresh already on its way read the old answer; let it finish so it cannot arm against this one.
  if (refreshing) await refreshing;
  const withdrawn = async (pending: boolean) => {
    await updateState(member.userId, (s) => {
      s.withdrawPending = pending;
      if (s.plan) s.plan = { ...s.plan, consentAt: null, places: [] };
    });
  };
  if (!consent) {
    // Off on this phone FIRST — marked pending, so a refresh racing the request disarms too.
    await withdrawn(true);
    await disarm(member.userId);
    publish({ consentAt: null, places: 0 });
    try {
      await attendanceApi.autoClockConsent(false);
      await withdrawn(false);
    } catch {
      /* stays pending: the next refresh tells the server — it is off here either way */
    }
    return 'off';
  }
  try {
    await attendanceApi.autoClockConsent(true);
  } catch (err) {
    return isUnreachable(err) ? 'offline' : 'failed';
  }
  await updateState(member.userId, (s) => {
    s.withdrawPending = false;
  });
  const always = await ensureBackgroundLocation();
  await refreshAutoClock(member);
  return always ? 'on' : 'needs-always';
}

/** The end of a session: nothing armed, nothing remembered, nothing scheduled. */
export async function forgetAutoClock(userId: string | null): Promise<void> {
  if (userId) {
    // Its reminders go; what the outbox holds stays — it is the member's real arrival, sent when they sign back in.
    await standDown({ userId, engine: null, store: autoClockStore, notifier: autoClockNotifier }).catch(() => undefined);
    await autoClockStore.forget(userId);
  }
  status = INITIAL;
  listeners.forEach((l) => l());
}
