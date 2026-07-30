/**
 * Tour completion storage — behind a tiny interface so the persistence backend
 * is swappable (AsyncStorage now; a DB-synced impl later) without touching the
 * engine (dependency-inversion: the engine depends on `TourStorage`, not on
 * AsyncStorage).
 *
 * AsyncStorage is async, but the engine wants a synchronous `isCompleted`, so we
 * hydrate the completed-set into memory once (`load()`), read it synchronously,
 * and write through asynchronously (fire-and-forget).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TourStorage {
  /** Hydrate the in-memory set from disk. Call once before reading. */
  load(): Promise<void>;
  isCompleted(id: string): boolean;
  markCompleted(id: string): void;
  /** Reset one tour (or all when id is omitted) — powers "replay". */
  reset(id?: string): void;
}

// Bump this suffix whenever the guides change materially so completion resets and
// the updated walkthrough auto-runs again for everyone.
const KEY = 'hbcfield.tours.completed.v1';

export function createTourStorage(): TourStorage {
  let done = new Set<string>();
  let hydrated = false;

  const persist = () => {
    AsyncStorage.setItem(KEY, JSON.stringify([...done])).catch(() => {
      /* quota / private mode — non-fatal, tours just won't persist */
    });
  };

  return {
    async load() {
      if (hydrated) return;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) done = new Set(JSON.parse(raw) as string[]);
      } catch {
        done = new Set();
      }
      hydrated = true;
    },
    isCompleted: (id) => done.has(id),
    markCompleted: (id) => {
      if (!done.has(id)) {
        done.add(id);
        persist();
      }
    },
    reset: (id) => {
      if (!id) done = new Set();
      else done.delete(id);
      persist();
    },
  };
}
