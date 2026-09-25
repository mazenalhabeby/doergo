import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AttendanceStatus, BreakStatus } from '@hbcfield/shared/client';

/**
 * THE LAST SHIFT THIS PHONE WAS TOLD ABOUT.
 *
 * ⚠️ THE OFFLINE DATABASE IS NOT A PLACE TO PUT THIS. `useShift` already saved
 * every successful read into the offline records store — and that store is
 * `null` on most devices: the runtime needs expo-sqlite, netinfo and
 * expo-crypto all present AND the database to open, and where any of that
 * fails `offline.records` stays null and every read and write is a no-op. A
 * fix written against it changes nothing on the phone in front of you, which
 * is exactly what happened: the flash was "fixed" and looked identical.
 *
 * AsyncStorage is there on every build, and the home layout and the theme
 * already live in it.
 *
 * ⚠️ AND MEMORY COMES FIRST, BECAUSE DISK IS TOO LATE. Reading AsyncStorage is
 * a promise: the first frame is already on screen by the time it resolves, so
 * a refresh within the session would still flash the wrong card for a frame or
 * two. The module-level copy is read SYNCHRONOUSLY while `useState` is
 * initialising, so the very first render is already right. Disk is only for
 * the cold start, where a frame of nothing is unavoidable anyway.
 *
 * ⚠️ KEYED BY USER. Sign out and in as a colleague on the same device and the
 * provider is not remounted — an unkeyed copy would tell the next person they
 * are on somebody else's clock.
 */
export interface LastShift {
  status: AttendanceStatus | null;
  breaks: BreakStatus | null;
  /** When the server said it (epoch ms). */
  serverAt: number;
}

/**
 * How long a remembered shift is worth painting before the server answers.
 *
 * ⚠️ LONGER THAN ANY SHIFT, SHORTER THAN A HABIT. This exists to stop the card
 * guessing while a request is in flight; a week-old copy would put `ON THE
 * CLOCK` and a running hero in front of somebody who is not working, which is
 * the same lie as the flash, held longer.
 */
export const GOOD_FOR_MS = 18 * 60 * 60 * 1000;

const keyFor = (userId: string) => `@hbcfield/last-shift/${userId}`;

/** The synchronous half — see the note above. */
let memory: { userId: string; shift: LastShift } | null = null;

export function isFresh(shift: LastShift, now = Date.now()): boolean {
  return shift.serverAt > 0 && now - shift.serverAt <= GOOD_FOR_MS;
}

/** What this session already knows, with no await. Null when nothing usable. */
export function rememberedNow(userId: string | null | undefined): LastShift | null {
  if (!userId || !memory || memory.userId !== userId) return null;
  return isFresh(memory.shift) ? memory.shift : null;
}

/** What the last run of the app knew. Only worth asking on a cold start. */
export async function rememberedOnDisk(userId: string | null | undefined): Promise<LastShift | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastShift>;
    /*
      Defensive on read: a half-written value or an older shape must cost a
      head start, never a crash on the screen people open the app for.
    */
    if (typeof parsed?.serverAt !== 'number') return null;
    const shift: LastShift = {
      status: (parsed.status ?? null) as AttendanceStatus | null,
      breaks: (parsed.breaks ?? null) as BreakStatus | null,
      serverAt: parsed.serverAt,
    };
    if (!isFresh(shift)) return null;
    memory = { userId, shift };
    return shift;
  } catch {
    return null;
  }
}

/** Called on every answer the SERVER gives. */
export function remember(userId: string | null | undefined, shift: LastShift): void {
  if (!userId) return;
  memory = { userId, shift };
  /*
    Fire and forget. A failed write costs the next cold start its head start,
    which is a disappointment and not something to tell anybody about.
  */
  void AsyncStorage.setItem(keyFor(userId), JSON.stringify(shift)).catch(() => undefined);
}

/**
 * THE SAME TRICK FOR THE TOTALS — because ① AND ⑥ ARE DECIDED BY A SECOND
 * REQUEST.
 *
 * ⚠️ REMEMBERING THE SHIFT ALONE DOES NOT REMOVE THE FLASH, and this is why
 * the first two attempts looked identical to the bug. `lastToday` is what
 * turns "Ready to start" into "Done for today", and it comes from
 * `/attendance/history`, not from `/attendance/status` — so the card had a
 * complete, correct status answer and still drew ① until a SECOND round trip
 * landed. Captured frame by frame on a cold start: `Ready to start`, then
 * `DONE FOR TODAY`.
 *
 * ⚠️ AND IT IS KEYED BY THE LOCAL DAY. `lastToday` means *today*; yesterday's
 * copy would greet somebody with `Done for today` before they had started.
 */
export interface LastTotals {
  /** The LOCAL calendar day these were computed for — `2026-09-25`. */
  day: string;
  monthMinutes: number | null;
  weekMinutes: number | null;
  /** Serialised: it crosses AsyncStorage, so dates arrive as strings. */
  lastToday: unknown;
  lastIn: string | null;
  serverAt: number;
}

const totalsKeyFor = (userId: string) => `@hbcfield/last-totals/${userId}`;
let totalsMemory: { userId: string; totals: LastTotals } | null = null;

/** Today, as the member's own calendar reads it. */
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function totalsUsable(t: LastTotals, now = Date.now()): boolean {
  return t.day === localDay(new Date(now)) && now - t.serverAt <= GOOD_FOR_MS;
}

export function rememberedTotalsNow(userId: string | null | undefined): LastTotals | null {
  if (!userId || !totalsMemory || totalsMemory.userId !== userId) return null;
  return totalsUsable(totalsMemory.totals) ? totalsMemory.totals : null;
}

export async function rememberedTotalsOnDisk(userId: string | null | undefined): Promise<LastTotals | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(totalsKeyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastTotals>;
    if (typeof parsed?.day !== 'string' || typeof parsed?.serverAt !== 'number') return null;
    const totals = {
      day: parsed.day,
      monthMinutes: parsed.monthMinutes ?? null,
      weekMinutes: parsed.weekMinutes ?? null,
      lastToday: parsed.lastToday ?? null,
      lastIn: parsed.lastIn ?? null,
      serverAt: parsed.serverAt,
    } as LastTotals;
    if (!totalsUsable(totals)) return null;
    totalsMemory = { userId, totals };
    return totals;
  } catch {
    return null;
  }
}

export function rememberTotals(userId: string | null | undefined, totals: LastTotals): void {
  if (!userId) return;
  totalsMemory = { userId, totals };
  void AsyncStorage.setItem(totalsKeyFor(userId), JSON.stringify(totals)).catch(() => undefined);
}

/** ⚠️ On sign-out — the next person on this phone is not on this clock. */
export function forgetShift(userId: string | null | undefined): void {
  memory = null;
  totalsMemory = null;
  if (!userId) return;
  void AsyncStorage.multiRemove([keyFor(userId), totalsKeyFor(userId)]).catch(() => undefined);
}
