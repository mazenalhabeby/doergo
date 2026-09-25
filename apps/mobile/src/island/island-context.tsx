import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { coversStatusBar } from './geometry';
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
  /** Anything richer than the four words above. */
  say: (input: { tone: Tone; title: string; body?: string; value?: string; action?: { label: string; onPress: () => void } }) => void;
  /** ⚠️ The island is open over the status bar — the ONE `<StatusBar>` hides. */
  statusBarHidden: boolean;
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
    never a list of floating cards. ⚠️ NOTHING IS PERSISTENT: every message
    shows for a few seconds and closes.
  */
  const [current, setCurrent] = useState<IslandMessage | null>(null);
  /*
    ⚠️ THE LIVE SHIFT HAD NO WAY OUT. It IS the collapsed state, so a tap on
    it dismissed the message and `shift()` put it straight back — a black bar
    on the member's screen all day that nothing could close. Swiping it away
    means "not for the rest of this shift": it comes back on the next clock-in,
    and a real message still gets through, because a message is news and this
    was only ever a status.
  */
  const queue = useRef<IslandMessage[]>([]);
  const nextId = useRef(1);

  const shift = useCallback(() => {
    setCurrent(queue.current.shift() ?? null);
  }, []);

  const push = useCallback((msg: Omit<IslandMessage, 'id'>) => {
    const full: IslandMessage = { ...msg, id: nextId.current++ };
    setCurrent((prev) => {
      /*
        ⚠️ DUPLICATES COLLAPSE, THEY DO NOT STACK. Two identical failures are
        one fact with a count, and `setToast` overwriting mid-animation is one
        of the things this replaces.
      */
      if (prev && prev.title === full.title && prev.body === full.body && prev.tone === full.tone) return full;
      if (!prev) return full;
      queue.current = [...queue.current, full].slice(-QUEUE_CAP);
      return prev;
    });
  }, []);

  /* The dwell clock. ⚠️ Every message closes on its own. */
  useEffect(() => {
    if (!current) return;
    const base = current.dwell > 0 ? current.dwell : dwellFor(current.tone, !!current.action);
    const dwell = screenReader ? Math.max(base, SCREEN_READER_MIN_DWELL) : base;
    const t = setTimeout(shift, dwell);
    return () => clearTimeout(t);
  }, [current, screenReader, shift]);

  const statusBarHidden = !!current && coversStatusBar(hole);

  /** ⚠️ Swipe up — §10. The one way to be rid of it. */
  const swipeAway = useCallback((msg: IslandMessage) => {
    setCurrent(null);
    queue.current = [];
  }, []);

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
      statusBarHidden: false,
    };
  }, [push, say]);

  const withBar = useMemo<IslandContextValue>(
    () => ({ ...value, statusBarHidden }),
    [value, statusBarHidden],
  );

  return (
    <IslandContext.Provider value={withBar}>
      {children}
      <IslandView
        hole={hole}
        screenW={screenW}
        message={current}
        reduceMotion={reduceMotion}
        onDismiss={shift}
        onSwipeAway={swipeAway}
      />
    </IslandContext.Provider>
  );
}
