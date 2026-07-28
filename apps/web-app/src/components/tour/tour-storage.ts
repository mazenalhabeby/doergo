/**
 * Tour completion storage — behind a tiny interface so the persistence backend
 * is swappable (localStorage now; a DB-synced impl later) without touching the
 * engine. (Dependency-inversion: the engine depends on `TourStorage`, not on
 * localStorage.)
 */
export interface TourStorage {
  isCompleted(id: string): boolean
  markCompleted(id: string): void
  /** Reset one tour (or all when id is omitted) — powers "replay". */
  reset(id?: string): void
}

// Bump this suffix whenever the guides change materially so completion resets and
// the updated walkthrough auto-runs again for everyone.
// v2: dashboard-spaces walkthrough + example teammates.
// v3: full deep space walkthrough (headcount, on-site, teammate, in-field, off-site, off-duty, actions).
const KEY = "hbcfield.tours.completed.v3"

/** localStorage-backed store. Per-browser; zero backend. */
export function createLocalTourStorage(): TourStorage {
  const read = (): string[] => {
    if (typeof window === "undefined") return []
    try {
      const raw = window.localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  }
  const write = (ids: string[]) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(ids))
    } catch {
      /* private mode / quota — non-fatal, tours just won't persist */
    }
  }
  return {
    isCompleted: (id) => read().includes(id),
    markCompleted: (id) => {
      const cur = read()
      if (!cur.includes(id)) write([...cur, id])
    },
    reset: (id) => {
      if (!id) write([])
      else write(read().filter((x) => x !== id))
    },
  }
}
