import { useCallback, useEffect, useRef, useState } from 'react';
import { keep, keptNow, keptOnDisk, type KeepRules } from './store';

/**
 * A WIDGET'S ANSWER — remembered, so it never states something it does not
 * know.
 *
 * Every widget on the home screen has the same shape: ask the server, wait,
 * then choose a state. The waiting is where they all go wrong in the same way,
 * because a state chosen from `null` is a state chosen from an ABSENCE — and
 * `null` means both "nothing to report" and "we have not been told yet". The
 * shift card said `Ready to start` to somebody who had already finished; the
 * next widget will find its own version of that sentence.
 *
 * So: the last answer is remembered and painted at once, and until there IS an
 * answer the widget is told `ready: false` and draws nothing rather than
 * guessing. Both halves are needed — remembering alone still leaves the first
 * ever load, and waiting alone makes every launch start empty.
 *
 * ```ts
 * const crew = useRemembered({
 *   name: 'crew',
 *   userId: user?.id ?? null,
 *   load: () => crewApi.today(),
 *   sameDay: true,           // the answer means "today"
 * });
 * if (!crew.ready) return null;
 * ```
 *
 * ⚠️ ONE QUESTION PER `name`. It is the storage key, so two widgets sharing a
 * name hand each other's answers over after a restart.
 */
export interface Remembered<T> {
  /** The best answer known. Null only while nothing is. */
  data: T | null;
  /**
   * An answer is known — from this session, from disk, or from the server.
   *
   * ⚠️ NOT `data !== null`. That is the whole bug this hook exists for: an
   * empty answer and an unasked question are the same value, and a widget that
   * cannot tell them apart renders a decision either way.
   */
  ready: boolean;
  /** Where the answer on screen came from. `phone` is a remembered copy. */
  from: 'pending' | 'phone' | 'server' | 'none';
  /** Ask again. Safe to call on focus. */
  refresh: () => Promise<void>;
}

export function useRemembered<T>(input: {
  /** Stable name for this question — it becomes the storage key. */
  name: string;
  userId: string | null | undefined;
  /** Ask the server. ⚠️ Throwing means "no answer", never "empty". */
  load: () => Promise<T>;
  /** Ask again when this changes. Compared by `String()`. */
  revision?: unknown;
  /** False where the question does not apply — `ready` is then true at once. */
  enabled?: boolean;
  /** Storage holds no Dates. Give the shape a round trip when it has any. */
  revive?: (kept: T) => T;
} & KeepRules): Remembered<T> {
  const { name, userId, load, revision, enabled = true, revive, goodForMs, sameDay } = input;
  const rules: KeepRules = { goodForMs, sameDay };

  /* ⚠️ Synchronously — a promise resolves after the first frame is drawn. */
  const [state, setState] = useState<{ data: T | null; from: Remembered<T>['from'] }>(() => {
    const known = keptNow<T>(name, userId, rules);
    return known ? { data: revive ? revive(known) : known, from: 'phone' } : { data: null, from: 'pending' };
  });

  /* The cold start: what the LAST run knew. ⚠️ Only ever fills a gap. */
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void keptOnDisk<T>(name, userId, rules).then((known) => {
      if (!alive || !known) return;
      setState((prev) => (prev.from === 'pending' ? { data: revive ? revive(known) : known, from: 'phone' } : prev));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, userId, goodForMs, sameDay]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const value = await load();
      keep(name, userId, value, rules);
      setState({ data: value, from: 'server' });
    } catch {
      /*
        ⚠️ A FAILED ASK MUST NOT REPLACE AN ANSWER WITH AN ABSENCE. `refresh`
        runs on every focus, so one 500 used to blank a card that was right a
        second earlier — and, where the widget hides itself when it knows
        nothing, take it off the screen. Knowing less than we did is not news.
      */
      setState((prev) => (prev.from === 'pending' ? { data: null, from: 'none' } : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, load, name, userId, goodForMs, sameDay]);

  /* Ask once per revision — ⚠️ and a cancelled run forgets it asked. */
  const askedFor = useRef('');
  useEffect(() => {
    if (!enabled) return;
    const key = `${name}|${userId ?? ''}|${String(revision ?? '')}`;
    if (askedFor.current === key) return;
    askedFor.current = key;
    let alive = true;
    void refresh().finally(() => { if (!alive && askedFor.current === key) askedFor.current = ''; });
    return () => { alive = false; };
  }, [enabled, name, userId, revision, refresh]);

  return {
    data: state.data,
    /* ⚠️ A question that does not apply is answered — see `enabled`. */
    ready: !enabled || state.from !== 'pending',
    from: state.from,
    refresh,
  };
}
