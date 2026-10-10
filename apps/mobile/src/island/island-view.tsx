import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type TextLayoutEventData, type NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  runOnJS,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ISLAND, TONES, type Tone } from './tokens';
import { FONT } from '../theme/amazen';
import { impact } from '../lib/haptics';
import { CAP, DROP_SIDE, EDGE, MAX_BODY_LINES, ICON, ICON_GAP, SIDE, readLayout, sealedBox, sealedVisible, type Cutout, type Layout, type Measured } from './geometry';

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

const SPRING = { damping: 26, stiffness: 240, mass: 1 } as const;
const OUT = 280;
const REDUCED = 180;

/** ⚠️ FILLED ICONS ONLY — an outline reads as a hairline on black. */
const ICONS: Record<Tone, keyof typeof Ionicons.glyphMap> = {
  done: 'checkmark-circle',
  waiting: 'alert-circle',
  failed: 'close-circle',
  queued: 'cloud-offline',
};

/** The time it arrived, for the right of the lens when the message has no figure of its own. */
function stamp(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function IslandView({
  hole,
  screenW,
  message,
  onDismiss,
  onSwipeAway,
  reduceMotion,
}: {
  hole: Cutout;
  screenW: number;
  message: IslandMessage | null;
  onDismiss: (id: number) => void;
  /** Swipe up closes it early. */
  onSwipeAway: (msg: IslandMessage) => void;
  reduceMotion: boolean;
}) {
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

  return (
    <>
      {/*
        The measuring layer. ⚠️ Off-screen and never visible: it exists so the
        rung can be decided from real text metrics before the first frame of
        the morph.
      */}
      {pending ? (
        <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text
            style={styles.title}
            onTextLayout={(e) => { widths.current.title = lineWidth(e); maybeCommit(); }}
          >
            {pending.title}
          </Text>
          {pending.title ? (
            <Text
              style={[styles.title, { width: capW - DROP_SIDE * 2 }]}
              onTextLayout={(e) => { widths.current.titleWrapped = e.nativeEvent.lines.length; maybeCommit(); }}
            >
              {pending.title}
            </Text>
          ) : null}
          <Text
            style={styles.value}
            onTextLayout={(e) => { widths.current.value = lineWidth(e); maybeCommit(); }}
          >
            {pending.value ?? ''}
          </Text>
          {pending.body ? (
            <Text
              style={[styles.body, { width: capW - DROP_SIDE * 2 }]}
              onTextLayout={(e) => { widths.current.bodyLines = e.nativeEvent.lines.length; maybeCommit(); }}
            >
              {pending.body}
            </Text>
          ) : null}
        </View>
      ) : null}

      {!msg && !idle ? null : (
      <View style={styles.stage} pointerEvents="box-none">
        <GestureDetector gesture={swipe}>
        <Animated.View
          style={[styles.island, { top: layout?.open.y ?? sealed.y }, boxStyle]}
          pointerEvents={msg ? 'auto' : 'none'}
        >
          {msg && layout ? (
            <View
              accessibilityRole={msg.action ? 'button' : 'alert'}
              accessibilityLabel={[msg.title, msg.value, msg.body].filter(Boolean).join('. ')}
                      accessibilityHint="Swipe up to dismiss"
              style={StyleSheet.absoluteFill}
            >
              {/*
                The head row, in the band the lens sits in: icon LEFT of the
                lens, time RIGHT of it. The ladder already decided both fit.
              */}
              <Animated.View style={[styles.headRow, { marginTop: layout.headTop, height: layout.headHeight }, headStyle]}>
                {layout.icon === 'left' ? <Glyph tone={msg.tone} fg={look.fg} /> : <View style={{ width: 0 }} />}
                {!layout.titleDrops && msg.title ? (
                  <Text numberOfLines={1} style={[styles.title, { color: ISLAND.ink }]}>
                    {msg.title}
                  </Text>
                ) : null}
                {/* ⚠️ The lens is in here. Left group hugs the left edge, the time the right. */}
                <View style={{ flex: 1 }} />
                {msg.value ? (
                  <Text numberOfLines={1} style={styles.value}>{msg.value}</Text>
                ) : null}
                {layout.icon === 'right' ? <Glyph tone={msg.tone} fg={look.fg} /> : null}
              </Animated.View>

              {/* ⚠️ What did not fit beside the lens goes UNDER it; the height was decided for it. */}
              {layout.titleDrops || msg.body || msg.action ? (
                <Animated.View style={[styles.drop, bodyStyle]}>
                  {layout.titleDrops ? <Text style={styles.title}>{msg.title}</Text> : null}
                  {msg.body ? <Text numberOfLines={MAX_BODY_LINES} style={[styles.body, !msg.title && styles.bodyAlone]}>{msg.body}</Text> : null}
                  {msg.action ? (
                    <Pressable onPress={msg.action.onPress} accessibilityRole="button" style={styles.action}>
                      <Text style={[styles.actionLabel, { color: look.fg }]}>{msg.action.label}</Text>
                    </Pressable>
                  ) : null}
                </Animated.View>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
        </GestureDetector>
      </View>
      )}
    </>
  );

  /** Both (or all three) measurements are in — decide and go. */
  function maybeCommit() {
    const p = pending;
    if (!p) return;
    if (p.body && widths.current.bodyLines === 0) return;
    if (p.title.length > 0 && (widths.current.title === 0 || widths.current.titleWrapped === 0)) return;
    if (p.value && widths.current.value === 0) return;
    commit(p);
  }
}

function lineWidth(e: NativeSyntheticEvent<TextLayoutEventData>): number {
  return e.nativeEvent.lines.reduce((m, l) => Math.max(m, l.width), 0);
}

function Glyph({ tone, fg }: { tone: Tone; fg: string }) {
  return <Ionicons name={ICONS[tone]} size={ICON} color={fg} />;
}

const styles = StyleSheet.create({
  /* Off-screen, and not a layout area for anything else. */
  measure: { position: 'absolute', top: -9999, left: -9999, opacity: 0 },
  /*
    ⚠️ A FULL-SCREEN OVERLAY, NOT A ZERO-HEIGHT STRIP. An absolutely
    positioned parent with no height clips its children on Android, where
    `overflow: hidden` is the default — the island would simply not be there,
    on the platform we cannot see while building it.
  */
  stage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 },
  island: {
    position: 'absolute',
    left: 0,
    /* ⚠️ Black in both themes — see `tokens.ts`. */
    backgroundColor: ISLAND.bg,
    overflow: 'hidden',
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ICON_GAP, paddingHorizontal: SIDE },
  /* Under the lens: a little more air than the head row, text left-aligned. */
  drop: { paddingHorizontal: DROP_SIDE, paddingTop: 4, paddingBottom: 16, gap: 3 },
  title: { fontFamily: FONT.sansMedium, fontSize: 16, lineHeight: 21, color: ISLAND.ink, letterSpacing: -0.2 },
  body: { fontFamily: FONT.sans, fontSize: 14, lineHeight: 19, color: ISLAND.dim },
  /* ⚠️ With no title the sentence IS the message — full ink, same size, so the measured height holds. */
  bodyAlone: { color: ISLAND.ink },
  /* The time: mono, quiet — it is context, not the news. */
  value: { fontFamily: FONT.monoMedium, fontSize: 13, lineHeight: 18, color: ISLAND.dim, fontVariant: ['tabular-nums'] },
  action: {
    alignSelf: 'flex-start', marginTop: 4, paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: ISLAND.line,
  },
  actionLabel: { fontFamily: FONT.sansMedium, fontSize: 13 },
});
