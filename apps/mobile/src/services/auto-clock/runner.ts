import {
  autoClockUndoDeadline,
  decideAutoClockIn,
  decideAutoClockOut,
  decidePresenceClockIn,
  presenceSessionEnd,
  localDateKey,
  type AttendanceStatus,
  type AutoClockPlace,
  type OccurrenceFix,
} from '@hbcfield/shared/client';
import { checkClockInLocally } from '@/offline/attendance/clock-in-check';
import { autoClockInFromPhone, autoClockOutFromPhone, undoAutoClockInFromPhone } from '@/offline/attendance/shift-actions';
import type { SyncEngine } from '@/offline/sync-engine';
import type { AutoClockNotifier } from './notifications';
import { departureBasis, entered, exited, placeAsLocation, presenceSettings, remindersFor } from './rules';
import { shiftForArrival, shiftForEntry, type PlaceState } from './rules';
import type { AutoClockState, AutoClockStore } from './store';

/*
  THE AUTOMATIC CLOCK ON THE PHONE — carrying the decisions out.

  Woken by the OS geofence (ENTER / EXIT of a workspace's area, even with the
  app closed), by the heartbeat and the background sync, and by the app opening.

  ⚠️ BACKGROUND JAVASCRIPT CANNOT WAIT. A geofence wake gets seconds, not the
  three-minute dwell. So an arrival is FILED at once — in the same outbox as a
  tap, with the moment the member walked in as its time — and HELD there
  (`held`, outbox/types.ts) until the dwell has passed; walking out first takes
  it back unsent. Whichever wake comes next after the dwell sends it, and since
  it carries its own time, arriving late changes nothing. A departure is the
  same with the exit grace.

  ⚠️ THE SAME CHECK AS A TAP. `checkClockInLocally` — the shared rules the
  server repeats — is asked before anything is filed. A refusal is not tried
  automatically: the member is told they arrived, and taps.
*/

export interface AutoClockDeps {
  userId: string;
  engine: SyncEngine;
  store: AutoClockStore;
  notifier: AutoClockNotifier;
  now(): Date;
  /** A fix for evidence, or null. */
  fix(): Promise<OccurrenceFix | null>;
  /** The member's shift as the phone knows it now (server, else its copy, with the queue laid over). */
  shift(): Promise<AttendanceStatus | null>;
}

/* One at a time: an ENTER and an EXIT a second apart, and the app opening, all read and write one record. */
let chain: Promise<unknown> = Promise.resolve();
export function serially<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => undefined);
  return next;
}

/** The member's shift, asked at most once per run. */
function once<T>(get: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= get());
}

const placeOf = (state: AutoClockState, spaceId: string): AutoClockPlace | null =>
  state.plan?.consentAt ? state.plan.places.find((p) => p.spaceId === spaceId && p.settings.enabled) ?? null : null;

const GONE = new Set(['discarded', 'failed', 'conflict']);

/** How long after leaving a departure is still worth deciding (a phone asleep through the evening still files it). */
export const DEPARTURE_RELEVANT_MS = 12 * 60 * 60_000;
const opState = (engine: SyncEngine, id: string) => engine.operations().find((o) => o.id === id)?.state;

/** An ENTER or EXIT of an automatic region. */
export function onRegionEvent(deps: AutoClockDeps, kind: 'enter' | 'exit', spaceId: string, at: Date): Promise<void> {
  return serially(async () => {
    const state = await deps.store.load(deps.userId);
    const place = placeOf(state, spaceId);
    if (!place) return;
    const shift = once(deps.shift);
    if (kind === 'enter') await arrive(deps, state, place, at.getTime(), shift);
    else await depart(deps, state, place, at.getTime(), shift);
    await deps.store.save(deps.userId, state);
    void deps.engine.flush();
  });
}

async function arrive(deps: AutoClockDeps, state: AutoClockState, place: AutoClockPlace, at: number, shift: () => Promise<AttendanceStatus | null>) {
  const prev = state.places[place.spaceId];
  const ps: PlaceState = entered(prev, at);
  // Back inside before the exit grace ran out: the departure is taken back, never sent.
  if (ps.outOp) {
    const { entryId, opId } = ps.outOp;
    delete ps.outOp;
    if (await deps.engine.cancelPending(opId)) {
      const status = await shift();
      const entry = status?.isClockedIn ? status.currentEntry : null;
      const s = entry ? shiftForEntry(place, new Date(entry.clockInAt)) : null;
      // Still here after the end: ask again once the grace has passed again.
      const endAt = new Date(deps.now().getTime() + place.settings.exitGraceMinutes * 60_000);
      if (entry?.id === entryId && s) await deps.notifier.reminders({ userId: deps.userId, entryId, place: place.name, rest: null, endAt, shiftEnd: s.end });
    }
  }
  state.places[place.spaceId] = ps;
  await tryArrival(deps, state, place, shift);
}

async function depart(deps: AutoClockDeps, state: AutoClockState, place: AutoClockPlace, at: number, shift: () => Promise<AttendanceStatus | null>) {
  const ps: PlaceState = exited(state.places[place.spaceId], at);
  // Out again inside the dwell: that was a drive-past — the held clock-in goes, unsent.
  // ⚠️ Only inside the dwell: offline, a clock-in past its dwell is still cancellable, and taking it back
  // on a walk to the van made the shift's clock-in vanish. Later exits are judged by tryDeparture.
  if (ps.inOp && at < ps.inOp.holdUntil) {
    const { opId, entryId } = ps.inOp;
    if (await deps.engine.cancelPending(opId)) await deps.notifier.cancel(entryId);
    delete ps.inOp;
  }
  state.places[place.spaceId] = ps;
  await tryDeparture(deps, state, place, shift);
}

/** Inside, nothing filed yet: is it time? */
async function tryArrival(deps: AutoClockDeps, state: AutoClockState, place: AutoClockPlace, shift: () => Promise<AttendanceStatus | null>) {
  const ps = state.places[place.spaceId];
  if (!ps?.inside || ps.enteredAt === undefined || ps.inOp) return;
  const now = deps.now();
  const planned = shiftForArrival(place, now);
  const status = await shift();
  const clockedIn = !!status?.isClockedIn;
  // A shift today rules the day; with none, a member clocked by arriving and leaving goes by their usual hours.
  const presence = planned ? null : presenceSettings(place);
  const decision = presence
    ? decidePresenceClockIn({
        settings: presence,
        now,
        enteredAt: new Date(ps.enteredAt),
        stillInside: true,
        timezone: place.presence!.timezone,
        alreadyClockedIn: clockedIn,
      })
    : decideAutoClockIn({
        settings: place.settings,
        now,
        enteredAt: new Date(ps.enteredAt),
        stillInside: true,
        shiftStart: planned?.start ?? null,
        shiftEnd: planned?.end ?? null,
        alreadyClockedIn: clockedIn,
      });
  if (decision.action === 'ASK') {
    // Outside their usual hours: ask, once a day — never turn a visit into a shift on its own.
    await promptOncePerDay(deps, ps, place, now, true);
    return;
  }
  if (decision.action === 'SKIP' || (!planned && !presence)) return;
  const holdUntil = decision.action === 'WAIT' ? decision.until.getTime() : now.getTime();
  const at = decision.action === 'CLOCK_IN' ? decision.at : new Date(holdUntil - place.settings.dwellMinutes * 60_000);

  const fix = await deps.fix();
  const location = status?.assignedLocations?.find((l) => l.id === place.spaceId) ?? placeAsLocation(place);
  const verdict = checkClockInLocally({ location, fix, alreadyClockedIn: clockedIn, now: at, fixCheckedAt: now });
  if (!('code' in verdict) && verdict.away) return; // only ever AT the site — "away" is a person's choice
  if ('code' in verdict) {
    // Not inside the drawn site yet (the OS circle is wider): wait for the next wake.
    if (verdict.code === 'OUTSIDE_SITE' || verdict.code === 'ALREADY_CLOCKED_IN') return;
    await promptOncePerDay(deps, ps, place, now);
    return;
  }

  const filed = await autoClockInFromPhone(deps.engine, { locationId: place.spaceId, fix: fix!, at, holdUntil });
  ps.inOp = { opId: filed.opId, entryId: filed.entryId, at: at.getTime(), holdUntil };
  await deps.notifier.clockedIn({ userId: deps.userId, entryId: filed.entryId, place: place.name, at, showAt: new Date(holdUntil) });
  if (planned) {
    const reminders = remindersFor({ settings: place.settings, shift: planned, now });
    await deps.notifier.reminders({ userId: deps.userId, entryId: filed.entryId, place: place.name, rest: reminders.rest, endAt: reminders.end, shiftEnd: planned.end });
  } else if (presence) {
    // No rest is placed without a plan; "Still working?" comes at the workspace's hours.
    const endAt = presenceSessionEnd(at, presence);
    await deps.notifier.reminders({ userId: deps.userId, entryId: filed.entryId, place: place.name, rest: null, endAt, shiftEnd: endAt, presence: { hours: presence.noShiftMinutes / 60, limit: presence.noShiftLimit } });
  }
}

/** "You arrived — tap to clock in", at most once a day per workspace. */
async function promptOncePerDay(deps: AutoClockDeps, ps: PlaceState, place: AutoClockPlace, now: Date, outsideHours = false) {
  const today = localDateKey(now);
  if (ps.promptedDay === today) return;
  ps.promptedDay = today;
  // Inside their hours, the shift it is for: "You're at X · your shift starts at 08:00" (the card's own words).
  const startsAt = outsideHours ? null : shiftForArrival(place, now)?.start ?? null;
  await deps.notifier.arrivedPrompt({
    userId: deps.userId, spaceId: place.spaceId, place: place.name, ...(outsideHours ? { outsideHours } : {}), ...(startsAt ? { startsAt } : {}),
  });
}

/** Outside, clocked in here, nothing filed: did they go home? */
async function tryDeparture(deps: AutoClockDeps, state: AutoClockState, place: AutoClockPlace, shift: () => Promise<AttendanceStatus | null>) {
  const ps = state.places[place.spaceId];
  if (!ps || ps.inside || ps.exitedAt === undefined || ps.outOp) return;
  const status = await shift();
  const entry = status?.isClockedIn ? status.currentEntry : null;
  if (!entry || (entry.locationId ?? entry.location?.id) !== place.spaceId) return;
  const now = deps.now();
  const exitedAt = new Date(ps.exitedAt);
  const basis = departureBasis(place, entry, ps.inOp, exitedAt);
  if (basis.kind === 'undo') {
    // Clocked by presence and gone inside the Undo window: they never stayed — undone, as Undo would.
    await undoAutoClockInFromPhone(deps.engine, { entryId: entry.id });
    await deps.notifier.cancel(entry.id);
    delete ps.inOp;
    return;
  }
  if (basis.kind === 'excursion') return;
  const plannedEnd = basis.plannedEnd;
  const decision = decideAutoClockOut({ settings: place.settings, now, exitedAt, stillOutside: true, plannedEnd, clockedIn: true });
  if (decision.action === 'SKIP') return;
  const holdUntil = decision.action === 'WAIT' ? decision.until.getTime() : now.getTime();
  const filed = await autoClockOutFromPhone(deps.engine, { entryId: entry.id, fix: await deps.fix(), at: exitedAt, holdUntil });
  ps.outOp = { opId: filed.opId, entryId: entry.id };
  // They are gone: no "still here?".
  await deps.notifier.cancel(entry.id, ['end']);
}

/**
 * Look again — the app opening, a heartbeat, a background sync. Files what a
 * wake missed (inside before the window opened; the first fix was not yet
 * inside the drawn site), forgets what the server refused or the member took
 * back, and takes down reminders of a shift that is no longer running.
 */
export function reevaluate(deps: AutoClockDeps, opts: { checkShift?: boolean } = {}): Promise<void> {
  return serially(async () => {
    const state = await deps.store.load(deps.userId);
    if (!state.plan?.consentAt) return;
    const shift = once(deps.shift);
    const now = deps.now().getTime();
    for (const [spaceId, ps] of Object.entries(state.places)) {
      const place = placeOf(state, spaceId);
      if (!place) {
        delete state.places[spaceId];
        continue;
      }
      if (ps.inOp) {
        const s = opState(deps.engine, ps.inOp.opId);
        // Refused by the server, or taken back: nothing of it stays on the phone.
        if (!s || GONE.has(s)) {
          if (s) await deps.notifier.cancel(ps.inOp.entryId);
          if (s && ps.inside) ps.enteredAt = undefined; // a refused arrival is not retried on its own
          delete ps.inOp;
        } else if (now > autoClockUndoDeadline(new Date(ps.inOp.at), place.settings).getTime()) {
          // The Undo window is over: the notification and its button go.
          await deps.notifier.cancel(ps.inOp.entryId, ['in']);
        }
      }
      if (ps.outOp) {
        const s = opState(deps.engine, ps.outOp.opId);
        if (!s || s === 'done' || GONE.has(s)) {
          if (s === 'done') await deps.notifier.cancel(ps.outOp.entryId);
          delete ps.outOp;
        }
      }
      // A departure long past is no longer a question — and asking it would cost a request every wake.
      if (!ps.inside && !ps.outOp && ps.exitedAt !== undefined && now - ps.exitedAt > DEPARTURE_RELEVANT_MS) delete ps.exitedAt;
      if (ps.inside) await tryArrival(deps, state, place, shift);
      else await tryDeparture(deps, state, place, shift);
    }
    if (opts.checkShift) {
      // A shift closed elsewhere (another phone, the office): its reminders go.
      const status = await shift();
      const running = status?.isClockedIn ? status.currentEntry?.id : null;
      for (const ps of Object.values(state.places)) {
        const entryId = ps.inOp?.entryId;
        if (entryId && entryId !== running && opState(deps.engine, ps.inOp!.opId) === 'done') await deps.notifier.cancel(entryId);
      }
    }
    await deps.store.save(deps.userId, state);
    await deps.engine.flush();
  });
}

/**
 * Stop: consent withdrawn, the plan gone, the member signed out. What is still
 * held on the phone is taken back — a decision the member has just revoked must
 * not be sent later — and every reminder goes. What already reached the server
 * stays: that is the record, and correcting it is the office's.
 */
export function standDown(deps: { userId: string; engine: SyncEngine | null; store: AutoClockStore; notifier: AutoClockNotifier }): Promise<void> {
  return serially(async () => {
    const state = await deps.store.load(deps.userId);
    for (const ps of Object.values(state.places)) {
      for (const filed of [ps.inOp, ps.outOp]) {
        if (!filed) continue;
        if (deps.engine && opState(deps.engine, filed.opId) === 'held') await deps.engine.cancelPending(filed.opId);
        await deps.notifier.cancel(filed.entryId);
      }
    }
    state.places = {};
    await deps.store.save(deps.userId, state);
  });
}
