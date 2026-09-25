import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reserveFor, sealedBox, shapeFor } from './geometry';
import { useCutout } from './cutout';
import { IslandView, type IslandMessage } from './island-view';
import { SCREEN_READER_MIN_DWELL, dwellFor, type Tone } from './tokens';

/**
 * THE ISLAND, MOUNTED ONCE — and the toast API it replaces, unchanged.
 *
 * ⚠️ THE OLD SHAPE IS KEPT ON PURPOSE. Nine files call `useToast()`, and
 * rewriting them in the same change as the island would mean a broken screen
 * and no way to tell which half broke it. `success` / `error` / `warning` /
 * `info` still take `(title, message?)` and still mean what they meant, so the
 * swap is one line in the layout.
 *
 * ⚠️ AND THE OLD `title` WAS USUALLY THE USELESS WORD. `success('Success',
 * 'Clocked in at Main Office')` puts `Success` in the loudest slot and the
 * fact underneath it. Fixing those call sites is a SECOND commit — mixing the
 * two is how a rewrite becomes unreviewable.
 */

interface ToastContextValue {
  showToast: (config: { type: 'success' | 'error' | 'warning' | 'info'; title: string; message?: string; duration?: number }) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

interface IslandContextValue extends ToastContextValue {
  /**
   * ⚠️ THE PERSISTENT ONE. While a member is on the clock the island never
   * leaves: it shrinks to a jade ring and a running figure and stays, so every
   * screen in the app inherits a live shift clock for nothing.
   */
  live: (input: { label: string; value: string }) => void;
  clearLive: () => void;
  /** Anything richer than the four words above. */
  say: (input: { tone: Tone; title: string; body?: string; value?: string; action?: { label: string; onPress: () => void } }) => void;
  /**
   * ⚠️ A VISOR IS BLACK, AND IN LIGHT MODE THE STATUS BAR DRAWS DARK ICONS ON
   * IT — §5.5. The clock and the battery vanish.
   *
   * ⚠️ AND THE ANSWER IS NOT A SECOND `<StatusBar>`. There is exactly one in
   * the tree and the comment above it records the bug that came from having
   * two: both write the same global on every render and which one lands is
   * commit order. That one component reads this flag.
   */
  visorShowing: boolean;
  /**
   * How far the live island pushes the app's CONTENT down, in points.
   *
   * ⚠️ PUBLISHED, NOT PAINTED. The first cut padded the provider's own
   * children, which cut the gradient off at the padding and left a black band
   * across the top with the clock and the battery sitting on it. `Ground`
   * says it in its own header — *no status bar is ever drawn, the gradient
   * runs under it* — and §5.5 shows exactly that: the clock to the visor's
   * left and the battery to its right, ON THE GRADIENT. So the ground stays
   * full-bleed and only what stands on it moves.
   */
  reserve: number;
}

const IslandContext = createContext<IslandContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(IslandContext);
  if (!ctx) throw new Error('useToast must be used within an IslandProvider');
  return ctx;
}

export function useIsland(): IslandContextValue {
  const ctx = useContext(IslandContext);
  if (!ctx) throw new Error('useIsland must be used within an IslandProvider');
  return ctx;
}

/** ⚠️ Capped at 3, oldest dropped — §10. A backlog nobody reads is noise. */
const QUEUE_CAP = 3;

export function IslandProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { hole, screenW } = useCutout(insets);

  /* ⚠️ Reduce Motion is a setting, not a guess — §8 rule 6. */
  const [reduceMotion, setReduceMotion] = useState(false);
  /* ⚠️ With a screen reader, nothing auto-dismisses inside 6s (WCAG 2.2.1). */
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => undefined);
    const a = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const b = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { a.remove(); b.remove(); };
  }, []);

  /*
    ⚠️ ONE ISLAND. It is one piece of hardware; two would destroy the illusion
    instantly. So there is one `current`, one `queue`, and one live state —
    never a list of floating cards.
  */
  const [current, setCurrent] = useState<IslandMessage | null>(null);
  const [liveMsg, setLiveMsg] = useState<IslandMessage | null>(null);
  const queue = useRef<IslandMessage[]>([]);
  const nextId = useRef(1);

  const shift = useCallback(() => {
    const next = queue.current.shift() ?? null;
    /*
      ⚠️ THE LIVE SHIFT ALWAYS WINS THE COLLAPSED STATE. When a message
      finishes it sinks back to the ring and the figure, not to sealed — the
      clock is the reason this exists.
    */
    setCurrent(next ?? liveMsg);
  }, [liveMsg]);

  const push = useCallback((msg: Omit<IslandMessage, 'id'>) => {
    const full: IslandMessage = { ...msg, id: nextId.current++ };
    setCurrent((prev) => {
      /*
        ⚠️ DUPLICATES COLLAPSE, THEY DO NOT STACK. Two identical failures are
        one fact with a count, and `setToast` overwriting mid-animation is one
        of the things this replaces.
      */
      if (prev && prev.title === full.title && prev.body === full.body && prev.tone === full.tone) return full;
      /* A live ring is not a message — a real one simply takes over. */
      if (!prev || prev.tone === 'live') return full;
      queue.current = [...queue.current, full].slice(-QUEUE_CAP);
      return prev;
    });
  }, []);

  /* The dwell clock. ⚠️ `failed` and `queued` hold until acted on. */
  useEffect(() => {
    if (!current || current.tone === 'live') return;
    const dwell = current.dwell === 0 ? 0 : screenReader ? Math.max(current.dwell, SCREEN_READER_MIN_DWELL) : current.dwell;
    if (dwell === 0) return;
    const t = setTimeout(shift, dwell);
    return () => clearTimeout(t);
  }, [current, screenReader, shift]);

  /*
    ⚠️ ANY black box at the top edge, not only the live one: a transient
    message wears the same visor and puts the same black under the clock.
  */
  const shape = shapeFor(hole.kind);
  const visorShowing = shape === 'visor' && !!current;
  /* ⚠️ Only the LIVE state — a transient message floats. See `reserveFor`. */
  const target = liveMsg ? reserveFor(sealedBox(hole, screenW), shape, insets.top) : 0;

  const say = useCallback<IslandContextValue['say']>((input) => {
    push({ ...input, dwell: dwellFor(input.tone, !!input.action) });
  }, [push]);

  const value = useMemo<IslandContextValue>(() => {
    const legacy = (tone: Tone) => (title: string, message?: string) => {
      push({ tone, title, body: message, dwell: dwellFor(tone, false) });
    };
    return {
      showToast: ({ type, title, message, duration }) => {
        const tone: Tone = type === 'success' ? 'done' : type === 'error' ? 'failed' : type === 'warning' ? 'waiting' : 'queued';
        push({ tone, title, body: message, dwell: duration ?? dwellFor(tone, false) });
      },
      success: legacy('done'),
      error: legacy('failed'),
      warning: legacy('waiting'),
      /* ⚠️ `info` is the outbox voice in this app, so it is grey and mono. */
      info: legacy('queued'),
      say,
      visorShowing: false,
      reserve: 0,
      live: ({ label, value: figure }) => {
        const msg: IslandMessage = { id: nextId.current++, tone: 'live', title: label, value: figure, dwell: 0 };
        setLiveMsg(msg);
        /* Only take the surface if nothing louder is using it. */
        setCurrent((prev) => (!prev || prev.tone === 'live' ? msg : prev));
      },
      clearLive: () => {
        setLiveMsg(null);
        setCurrent((prev) => (prev?.tone === 'live' ? null : prev));
      },
    };
  }, [push, say]);

  const withLive = useMemo<IslandContextValue>(
    () => ({ ...value, visorShowing, reserve: target }),
    [value, visorShowing, target],
  );

  /*
    ⚠️ THE LIVE STATE RESERVES ITS SPACE — §5.1. A docked island occupies
    38 → 74 on an iPhone 13 while the safe area starts at 47, so it sits on
    the first 27pt of the app's own content. For a message that leaves after
    four seconds that is fine. For a pill that stays all day it is the exact
    fault this design replaced: the first cut put the ring on top of
    `Friday, September 25` and left it there.

    ⚠️ ONLY THE LIVE STATE, AND ONLY OFF `wrap`. A transient message must
    never move the app, or every clock-in would nudge the whole screen down
    and back for four seconds. On a wrapping cutout there is nothing to
    reserve — the island is inside the area the app already avoids.
  */
  return (
    <IslandContext.Provider value={withLive}>
      {children}
      <IslandView
        hole={hole}
        screenW={screenW}
        message={current}
        reduceMotion={reduceMotion}
        onDismiss={shift}
      />
    </IslandContext.Provider>
  );
}
