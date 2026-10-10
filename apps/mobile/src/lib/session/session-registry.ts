/**
 * What the end of a session must reach, without importing the screens that own it.
 *
 * Two kinds of thing live outside the auth layer and still belong to ONE
 * member: in-memory caches that screens build (the calendar's pages, the
 * customer portal's query client), and the offline engine, which alone knows
 * whether anything is still unsent. Both register here; `endSession` asks.
 *
 * ⚠️ A cache that does not register here SURVIVES SIGN-OUT. The next person on
 * the phone is greeted with it. Anything that holds a member's answers in
 * memory for longer than one screen registers a cleaner.
 */

type Cleaner = () => void | Promise<void>;

const cleaners = new Map<string, Cleaner>();

/** Register something to forget when the session ends. Returns the unregister. */
export function onSessionEnd(name: string, clean: Cleaner): () => void {
  cleaners.set(name, clean);
  return () => {
    if (cleaners.get(name) === clean) cleaners.delete(name);
  };
}

/** Run every registered cleaner; one failing never stops the others. */
export async function runSessionEndCleaners(): Promise<string[]> {
  const ran: string[] = [];
  for (const [name, clean] of [...cleaners]) {
    try {
      await clean();
    } catch {
      /* the rest still run */
    }
    ran.push(name);
  }
  return ran;
}

/** For tests: what is registered now. */
export function registeredCleaners(): string[] {
  return [...cleaners.keys()];
}

/*
  Does this member have work that exists only on this phone?

  The offline engine answers; it registers while it runs. No probe = nobody
  could look — and "unknown" is treated as "maybe" by anything deciding whether
  to delete, because deleting is the one step that cannot be taken back.
*/
const unsentProbes = new Map<string, () => boolean>();

export function registerUnsentProbe(userId: string, probe: () => boolean): () => void {
  unsentProbes.set(userId, probe);
  return () => {
    if (unsentProbes.get(userId) === probe) unsentProbes.delete(userId);
  };
}

/** True / false when the engine could answer, null when nobody could look. */
export function hasUnsentWork(userId: string): boolean | null {
  const probe = unsentProbes.get(userId);
  if (!probe) return null;
  try {
    return probe();
  } catch {
    return null;
  }
}
