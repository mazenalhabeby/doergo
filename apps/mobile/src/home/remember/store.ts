import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDateKey } from '@hbcfield/shared/client';
import { KEPT_PREFIX, sealedStore } from '../../lib/sealed-stores';

/**
 * WHAT THIS PHONE WAS LAST TOLD — one store for every widget.
 *
 * A widget that renders from `null` on its first frame does not render
 * *nothing*, it renders a DECISION made from an absence: the shift card
 * announced `Ready to start` to somebody who was on the clock, and corrected
 * itself in front of them a moment later. Every widget we add has the same
 * shape — a request, a gap, and a state that has to be chosen — so the answer
 * belongs here once rather than in each of them.
 *
 * Four things this has to get right, each of which cost a wrong fix:
 *
 * ⚠️ A STORE THAT EXISTS ON EVERY BUILD. The first attempt used the offline
 * records store, which is `null` wherever the offline runtime did not start —
 * it needs expo-sqlite, netinfo and expo-crypto present AND the database to
 * open, and where any of that fails every read and write through it is a
 * silent no-op. The simulator's app container held no offline database at
 * all. The fix changed nothing and looked exactly like the bug.
 *
 * ⚠️ MEMORY BEFORE DISK, BECAUSE DISK IS TOO LATE. `AsyncStorage.getItem` is a
 * promise, and the first frame is on screen before it resolves. The
 * module-level copy is read SYNCHRONOUSLY while `useState` initialises, so a
 * member who has opened the app in this session never sees a gap at all.
 * Disk is only for the cold start.
 *
 * ⚠️ BOUNDED, AND SOME ANSWERS MEAN "TODAY". A week-old copy is not a head
 * start, it is a lie held longer. `sameDay` answers are additionally dropped
 * when the local calendar day turns — `lastToday` saying "Done for today" the
 * next morning would be worse than the flash.
 *
 * ⚠️ KEYED BY USER, AND FORGOTTEN ON SIGN-OUT. The provider is not remounted
 * when a colleague signs in on the same device.
 */

export interface Kept<T> {
  value: T;
  /** When the server said it (epoch ms). */
  at: number;
  /** The LOCAL calendar day it was said on — only set for `sameDay` answers. */
  day?: string;
}

/** The default window: longer than any shift, shorter than a habit. */
export const GOOD_FOR_MS = 18 * 60 * 60 * 1000;

/** Today, as the member's own calendar reads it — never a UTC date. */
export function localDay(now: Date = new Date()): string {
  return localDateKey(now);
}

const keyFor = (name: string, userId: string) => `@hbcfield/kept/${name}/${userId}`;
/* Every kept key starts with KEPT_PREFIX (lib/sealed-stores.ts) — what sign-out sweeps. */

/*
  ⚠️ SEALED ON DISK (lib/secure-buffer.ts). These copies are somebody's shift,
  jobs and crew — plain JSON in AsyncStorage was readable from a backup. A
  plaintext copy from before is re-sealed in place on the first touch.
*/
const diskFor = (userId: string) => sealedStore('kept', userId);

/** The synchronous half. Keyed by storage key, so two users cannot collide. */
const memory = new Map<string, Kept<unknown>>();
/** Every key this session has written, so sign-out can clear them all. */
const written = new Set<string>();

export interface KeepRules {
  goodForMs?: number;
  /** ⚠️ The answer means "today" — see the note above. */
  sameDay?: boolean;
}

function stillGood(kept: Kept<unknown>, rules: KeepRules = {}, now = Date.now()): boolean {
  if (now - kept.at > (rules.goodForMs ?? GOOD_FOR_MS)) return false;
  if (rules.sameDay && kept.day !== localDay(new Date(now))) return false;
  return true;
}

/** What this session already knows, with no await. */
export function keptNow<T>(name: string, userId: string | null | undefined, rules?: KeepRules): T | null {
  if (!userId) return null;
  const kept = memory.get(keyFor(name, userId)) as Kept<T> | undefined;
  return kept && stillGood(kept, rules) ? kept.value : null;
}

/** What the LAST run of the app knew. Only worth asking on a cold start. */
export async function keptOnDisk<T>(
  name: string,
  userId: string | null | undefined,
  rules?: KeepRules,
): Promise<T | null> {
  if (!userId) return null;
  const key = keyFor(name, userId);
  try {
    const raw = await diskFor(userId).getItem(key);
    if (!raw) return null;
    const kept = JSON.parse(raw) as Kept<T>;
    /*
      Defensive on read: a half-written value or an older shape must cost a
      head start, never a crash on a screen somebody opens the app for.
    */
    if (!kept || typeof kept.at !== 'number') return null;
    if (!stillGood(kept, rules)) return null;
    memory.set(key, kept as Kept<unknown>);
    written.add(key);
    return kept.value;
  } catch {
    return null;
  }
}

/** Called with every answer the SERVER gives. */
export function keep<T>(name: string, userId: string | null | undefined, value: T, rules?: KeepRules): void {
  if (!userId) return;
  const key = keyFor(name, userId);
  const kept: Kept<T> = { value, at: Date.now(), ...(rules?.sameDay ? { day: localDay() } : {}) };
  memory.set(key, kept as Kept<unknown>);
  written.add(key);
  /*
    Fire and forget. A failed write costs the next cold start its head start,
    which is a disappointment and not something to tell anybody about.
  */
  void diskFor(userId).setItem(key, JSON.stringify(kept)).catch(() => undefined);
}

/**
 * ⚠️ ON SIGN-OUT. The next person on this phone is not on this clock, does not
 * hold these vans and is not on this route.
 */
export function forgetEverythingKept(): void {
  const keys = [...written];
  memory.clear();
  written.clear();
  /*
    ⚠️ EVERY kept key on the device, not only this session's. A copy written in
    an EARLIER run and never read in this one was not in `written`, so it
    survived the sign-out on disk — the next person's phone still held the last
    person's shift, jobs and crew counts.
  */
  void Promise.resolve()
    .then(() => AsyncStorage.getAllKeys())
    .then((all) => [...new Set([...keys, ...(all ?? []).filter((k) => k.startsWith(KEPT_PREFIX))])])
    .catch(() => keys)
    .then((drop) => (drop.length ? AsyncStorage.multiRemove(drop) : undefined))
    .catch(() => undefined);
}
