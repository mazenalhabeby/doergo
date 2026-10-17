import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  runOnJS,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TONES, type Tone } from './tokens';
import { impact } from '../lib/haptics';
import {
  CAP,
  EDGE,
  readLayout,
  sealedBox,
  sealedVisible,
  type Cutout,
  type Layout,
  type Measured,
} from './geometry';

/**
 * THE ISLAND ITSELF.
 *
 * ⚠️ ONE SPRING DRIVES WIDTH, HEIGHT AND RADIUS TOGETHER, and the height is
 * 40ms late so it reads as widen-THEN-drop. Both at once reads as a panel
 * appearing; widening then dropping reads as one object stretching, which is
 * what it is.
 *
 * ⚠️ AND THE RUNG IS DECIDED BEFORE ANYTHING ANIMATES. The text is measured
 * off-screen first, the final box is computed, and the content fades in
 * already at its final position. Re-wrapping text during a 420ms morph is
 * what makes cheap versions look cheap.
 */

export interface IslandMessage {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
  /** The trailing figure — a time, a duration, a count. Always mono. */
  value?: string;
  action?: { label: string; onPress: () => void };
  /** 0 = it stays until dismissed or acted on. */
  dwell: number;
}

export const SPRING = { damping: 26, stiffness: 240, mass: 1 } as const;

export const OUT = 280;

export const REDUCED = 180;

/** The time it arrived, for the right of the lens when the message has no figure of its own. */
export function stamp(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** IslandView's state and handlers — everything before its markup, moved here unchanged. */
export function useIslandView({
  hole,
  screenW,
  message,
  onDismiss,
  onSwipeAway,
  reduceMotion,
}: Pick<{
  hole: Cutout;
  screenW: number;
  message: IslandMessage | null;
  onDismiss: (id: number) => void;
  /** Swipe up closes it early. */
  onSwipeAway: (msg: IslandMessage) => void;
  reduceMotion: boolean;
}, 'hole' | 'screenW' | 'message' | 'onDismiss' | 'onSwipeAway' | 'reduceMotion'>) {
  const topInset = useSafeAreaInsets().top;
  const sealed = sealedBox(hole, screenW, topInset);
  /* ⚠️ Idle, only a measured Dynamic Island / punch hole keeps its pill. A notch IS the idle state. */
  const idle = sealedVisible(hole);
  /*
    ⚠️ MEASURE, THEN SHOW. `pending` is rendered invisibly for exactly one
    frame so `onTextLayout` can report real widths at the real font — never a
    character count, which is wrong by 30–40% the moment the locale is German.
  */
  const [pending, setPending] = useState<IslandMessage | null>(null);
  const [shown, setShown] = useState<{ msg: IslandMessage; layout: Layout } | null>(null);
  const widths = useRef({ title: 0, titleWrapped: 0, value: 0, bodyLines: 0 });

  const w = useSharedValue(sealed.w);
  const h = useSharedValue(sealed.h);
  const rTop = useSharedValue(sealed.radiusTop);
  const rBot = useSharedValue(sealed.radiusBottom);
  const x = useSharedValue(sealed.x);
  const head = useSharedValue(0);
  const body = useSharedValue(0);
  const vis = useSharedValue(idle ? 1 : 0);

  /* A new message: measure it first. */
  useEffect(() => {
    if (!message) { setPending(null); return; }
    if (shown?.msg.id === message.id) return;
    /* ⚠️ Icon left, TIME right — always. No figure of its own, so the time it arrived. */
    widths.current = { title: 0, titleWrapped: 0, value: 0, bodyLines: 0 };
    setPending({ ...message, value: message.value ?? stamp() });
  }, [message, shown?.msg.id]);

  /* Nothing to say: sink back. */
  useEffect(() => {
    if (message || !shown) return;
    /*
      ⚠️ THE BODY FADES BEFORE THE BOX SHRINKS, or you watch the text get
      crushed — §8 rule 5.
    */
    body.value = withTiming(0, { duration: 120 });
    head.value = withDelay(60, withTiming(0, { duration: 120 }));
    const to = (v: number) => (reduceMotion ? withTiming(v, { duration: REDUCED }) : withTiming(v, { duration: OUT, easing: Easing.out(Easing.cubic) }));
    w.value = withDelay(80, to(sealed.w));
    h.value = withDelay(80, to(sealed.h));
    rTop.value = withDelay(80, to(sealed.radiusTop));
    rBot.value = withDelay(80, to(sealed.radiusBottom));
    x.value = withDelay(80, to(sealed.x));
    /*
      ⚠️ BACK INTO THE CUTOUT, THEN GONE. On a notch the sealed box IS the
      notch, black on black, so hiding it at the end is invisible.
    */
    if (!idle) vis.value = withDelay(80 + OUT, withTiming(0, { duration: hole.kind === 'edge' ? 0 : 100 }));
    const t = setTimeout(() => setShown(null), OUT + 140);
    return () => clearTimeout(t);
  }, [message, shown, reduceMotion, idle, hole.kind, sealed.w, sealed.h, sealed.radiusTop, sealed.radiusBottom, sealed.x, w, h, rTop, rBot, x, head, body, vis]);

  /* Measured: decide the rung, then move. */
  const commit = (msg: IslandMessage) => {
    const measured: Measured = {
      title: widths.current.title,
      value: widths.current.value,
      bodyLines: msg.body ? Math.max(1, widths.current.bodyLines) : 0,
      titleWrapped: widths.current.titleWrapped,
      action: !!msg.action,
    };
    const layout = readLayout({ hole, screenW, measured, topInset });
    setShown({ msg, layout });
    setPending(null);

    /* ⚠️ Old content out FIRST — gone before anything travels far. */
    head.value = withTiming(0, { duration: 100 });
    body.value = withTiming(0, { duration: 100 });

    /*
      ⚠️ BORN AT THE CUTOUT. Coming from nothing, the box starts at exactly
      the cutout's size and position and grows out of it left and right. On a
      notch that first frame is black on black — the notch simply widens.
    */
    if (!shown && !idle) {
      w.value = sealed.w;
      h.value = sealed.h;
      x.value = sealed.x;
      rTop.value = sealed.radiusTop;
      rBot.value = sealed.radiusBottom;
      vis.value = hole.kind === 'edge' ? 1 : withTiming(1, { duration: 120 });
    }

    if (reduceMotion) {
      /* ⚠️ Cross-fade only. No spring, no travel, no overshoot — §8 rule 6. */
      const t = { duration: REDUCED, reduceMotion: ReduceMotion.Never } as const;
      w.value = withTiming(layout.open.w, t);
      h.value = withTiming(layout.open.h, t);
      rTop.value = withTiming(layout.open.radiusTop, t);
      rBot.value = withTiming(layout.open.radiusBottom, t);
      x.value = withTiming(layout.open.x, t);
      head.value = withDelay(60, withTiming(1, t));
      body.value = withDelay(60, withTiming(1, t));
    } else {
      /*
        ⚠️ A SECOND MESSAGE RE-TARGETS THE RUNNING SPRING from its current
        velocity — never queues behind the animation, never collapses to
        sealed first. `withSpring` does that for free; a `withTiming` curve
        here gives the whole trick away.
      */
      w.value = withSpring(layout.open.w, SPRING);
      x.value = withSpring(layout.open.x, SPRING);
      rTop.value = withSpring(layout.open.radiusTop, SPRING);
      rBot.value = withSpring(layout.open.radiusBottom, SPRING);
      /* ⚠️ 40ms late, so it reads as widen THEN drop. */
      h.value = withDelay(40, withSpring(layout.open.h, SPRING));
      head.value = withDelay(150, withTiming(1, { duration: 220 }));
      body.value = withDelay(230, withTiming(1, { duration: 220 }));
    }

    /* ⚠️ One soft impact on ARRIVAL, never on collapse. */
    impact('light');
    /* ⚠️ The toast this replaces announced nothing at all. */
    AccessibilityInfo.announceForAccessibility([msg.title, msg.value, msg.body].filter(Boolean).join('. '));
  };

  const capW = Math.min(CAP, screenW - EDGE * 2);
  const boxStyle = useAnimatedStyle(() => ({
    width: w.value,
    height: h.value,
    /* ⚠️ Four corners, because a notch island is square at the top. */
    borderTopLeftRadius: rTop.value,
    borderTopRightRadius: rTop.value,
    borderBottomLeftRadius: rBot.value,
    borderBottomRightRadius: rBot.value,
    transform: [{ translateX: x.value }],
    opacity: vis.value,
  }));
  const headStyle = useAnimatedStyle(() => ({ opacity: head.value, transform: [{ translateY: (1 - head.value) * 6 }] }));
  const bodyStyle = useAnimatedStyle(() => ({ opacity: body.value, transform: [{ translateY: (1 - body.value) * 6 }] }));

  const msg = shown?.msg ?? null;
  const layout = shown?.layout ?? null;

  const onTap = (m: IslandMessage) => {
    if (m.action) { m.action.onPress(); return; }
    onDismiss(m.id);
  };

  /*
    ⚠️ UP ONLY, AND FAR ENOUGH TO MEAN IT. This thing lives under the status
    bar where the OS's own pull-down starts; a downward or half-hearted pan
    must do nothing at all, or people will lose their shift clock by
    reaching for the notification shade.
  */
  const pan = Gesture.Pan()
    .activeOffsetY([-12, 999])
    .onEnd((e) => {
      'worklet';
      if (e.translationY < -24 && msg) runOnJS(onSwipeAway)(msg);
    });

  /*
    ⚠️ THE TAP HAS TO BE A GESTURE TOO, NOT A `Pressable`.

    The island was covered by a `Pressable` at `StyleSheet.absoluteFill`, and
    RN's responder system claims a touch on it the instant it goes down — so
    the pan never activated and the swipe simply did nothing. Two systems
    arguing over one surface, and the one with the whole area wins. Both are
    gestures now, raced: the pan takes over once it has 12pt of upward travel,
    the tap fires otherwise.
  */
  const tap = Gesture.Tap().onEnd((_e, ok) => {
    'worklet';
    if (!ok || !msg) return;
    runOnJS(onTap)(msg);
  });
  const swipe = Gesture.Exclusive(pan, tap);

  const look = msg ? TONES[msg.tone] : TONES.done;

  return {
    sealed,
    idle,
    pending,
    widths,
    body,
    commit,
    capW,
    boxStyle,
    headStyle,
    bodyStyle,
    msg,
    layout,
    swipe,
    look,
  };
}
