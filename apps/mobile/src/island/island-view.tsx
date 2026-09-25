import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, type TextLayoutEventData, type NativeSyntheticEvent } from 'react-native';
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
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ISLAND, TONES, type Tone } from './tokens';
import { CAP, EDGE, ICON, ICON_GAP, SIDE, readLayout, sealedBox, shapeFor, type Cutout, type Layout, type Measured } from './geometry';

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

const ICONS: Record<Tone, keyof typeof Ionicons.glyphMap> = {
  done: 'checkmark',
  live: 'ellipse-outline',
  waiting: 'alert-circle-outline',
  failed: 'close-circle-outline',
  queued: 'cloud-offline-outline',
};

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
  /**
   * ⚠️ SWIPE UP DISMISSES — §10, and it was never built.
   *
   * Without it the live shift had NO way out: it is the collapsed state, so a
   * tap on it dismissed the message and the provider put it straight back.
   * The member watched a black bar they could not close sit on their screen
   * all day, which is a worse version of the fault this replaced.
   */
  onSwipeAway: (msg: IslandMessage) => void;
  reduceMotion: boolean;
}) {
  const topInset = useSafeAreaInsets().top;
  const sealed = sealedBox(hole, screenW, topInset);
  const chrome = shapeFor(hole.kind) === 'visor';
  /*
    ⚠️ MEASURE, THEN SHOW. `pending` is rendered invisibly for exactly one
    frame so `onTextLayout` can report real widths at the real font — never a
    character count, which is wrong by 30–40% the moment the locale is German.
  */
  const [pending, setPending] = useState<IslandMessage | null>(null);
  const [shown, setShown] = useState<{ msg: IslandMessage; layout: Layout } | null>(null);
  const widths = useRef<{ title: number; value: number; bodyLines: number }>({ title: 0, value: 0, bodyLines: 0 });

  const w = useSharedValue(sealed.w);
  const h = useSharedValue(sealed.h);
  const rTop = useSharedValue(sealed.radiusTop);
  const rBot = useSharedValue(sealed.radiusBottom);
  const x = useSharedValue(sealed.x);
  const head = useSharedValue(0);
  const body = useSharedValue(0);

  /* A new message: measure it first. */
  useEffect(() => {
    if (!message) { setPending(null); return; }
    if (shown?.msg.id === message.id) return;
    setPending(message);
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
    /* ⚠️ A visor's chrome does not leave; only its content does — §5.5.2. */
    if (chrome) { const t = setTimeout(() => setShown(null), 260); return () => clearTimeout(t); }
    const to = (v: number) => (reduceMotion ? withTiming(v, { duration: REDUCED }) : withTiming(v, { duration: OUT, easing: Easing.out(Easing.cubic) }));
    w.value = withDelay(80, to(sealed.w));
    h.value = withDelay(80, to(sealed.h));
    rTop.value = withDelay(80, to(sealed.radiusTop));
    rBot.value = withDelay(80, to(sealed.radiusBottom));
    x.value = withDelay(80, to(sealed.x));
    const t = setTimeout(() => setShown(null), OUT + 140);
    return () => clearTimeout(t);
  }, [message, shown, reduceMotion, chrome, sealed.w, sealed.h, sealed.radiusTop, sealed.radiusBottom, sealed.x, w, h, rTop, rBot, x, head, body]);

  /* Measured: decide the rung, then move. */
  const commit = (msg: IslandMessage) => {
    /*
      ⚠️ THE LIVE STATE IS A RING AND A FIGURE — §7 (`◎ 0m`) and the drawing:
      *while you are on the clock it never leaves — a ring and a running
      figure*. Its label is for the screen reader, not the screen.

      Measuring it as a title made `On the clock · 1h 45m` exceed the visor's
      cap and DROP, so the thing that is supposed to sit quietly at the top of
      every screen all day became a black panel a third of the way down it.
    */
    const live = msg.tone === 'live';
    const measured: Measured = {
      title: live ? 0 : widths.current.title,
      value: widths.current.value,
      bodyLines: msg.body ? Math.max(1, widths.current.bodyLines) : 0,
      action: !!msg.action,
    };
    const layout = readLayout({ hole, screenW, measured, topInset });
    setShown({ msg, layout });
    setPending(null);

    /* ⚠️ Old content out FIRST — gone before anything travels far. */
    head.value = withTiming(0, { duration: 100 });
    body.value = withTiming(0, { duration: 100 });

    if (chrome) {
      /*
        ⚠️ ON A VISOR THE GEOMETRY NEVER MOVES — §5.5.2. The box is always
        `screenW × (topInset + 34)`; only the CONTENT changes. The spring in
        §8 is the pill stretching around a lens, and there is no lens here —
        springing a full-width bar's width and radius animates nothing and
        wobbles the one surface that is on screen all day.
      */
      w.value = layout.open.w;
      x.value = layout.open.x;
      rTop.value = layout.open.radiusTop;
      rBot.value = layout.open.radiusBottom;
      h.value = withTiming(layout.open.h, { duration: 180 });
      head.value = withDelay(100, withTiming(1, { duration: 220 }));
      body.value = withDelay(180, withTiming(1, { duration: 220 }));
    } else if (reduceMotion) {
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
    if (msg.tone !== 'live') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    /* ⚠️ The toast this replaces announced nothing at all. */
    AccessibilityInfo.announceForAccessibility([msg.title, msg.value, msg.body].filter(Boolean).join('. '));
  };

  const capW = Math.min(CAP, screenW - EDGE * 2);
  const boxStyle = useAnimatedStyle(() => ({
    width: w.value,
    height: h.value,
    /* ⚠️ Four corners, because a visor is square at the top — §5.5. */
    borderTopLeftRadius: rTop.value,
    borderTopRightRadius: rTop.value,
    borderBottomLeftRadius: rBot.value,
    borderBottomRightRadius: rBot.value,
    transform: [{ translateX: x.value }],
  }));
  const headStyle = useAnimatedStyle(() => ({ opacity: head.value, transform: [{ translateY: (1 - head.value) * 6 }] }));
  const bodyStyle = useAnimatedStyle(() => ({ opacity: body.value, transform: [{ translateY: (1 - body.value) * 6 }] }));

  const msg = shown?.msg ?? null;
  const layout = shown?.layout ?? null;

  /*
    ⚠️ UP ONLY, AND FAR ENOUGH TO MEAN IT. This thing lives under the status
    bar where the OS's own pull-down starts; a downward or half-hearted pan
    must do nothing at all, or people will lose their shift clock by
    reaching for the notification shade.
  */
  const swipe = Gesture.Pan()
    .activeOffsetY([-12, 999])
    .onEnd((e) => {
      'worklet';
      if (e.translationY < -24 && msg) runOnJS(onSwipeAway)(msg);
    });

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
          <Text
            style={[styles.value, styles.mono]}
            onTextLayout={(e) => { widths.current.value = lineWidth(e); maybeCommit(); }}
          >
            {pending.value ?? ''}
          </Text>
          {pending.body ? (
            <Text
              style={[styles.body, { width: capW - SIDE * 2 }]}
              onTextLayout={(e) => { widths.current.bodyLines = e.nativeEvent.lines.length; maybeCommit(); }}
            >
              {pending.body}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.stage} pointerEvents="box-none">
        <GestureDetector gesture={swipe}>
        <Animated.View
          style={[styles.island, { top: layout?.open.y ?? sealed.y }, boxStyle]}
          pointerEvents={msg ? 'auto' : 'none'}
        >
          {msg && layout ? (
            <Pressable
              onPress={() => (msg.action ? msg.action.onPress() : onDismiss(msg.id))}
              accessibilityRole={msg.action ? 'button' : 'alert'}
              accessibilityLabel={[msg.title, msg.value, msg.body].filter(Boolean).join('. ')}
              style={StyleSheet.absoluteFill}
            >
              {/* The head row: what fits beside the lens, and nothing more. */}
              {/*
                ⚠️ THE CONTENT ROW IS IN THE LOWER BAND ON A VISOR. Its upper
                band IS the status-bar strip — putting the message there would
                put it on the clock.
              */}
              {/*
                ⚠️ THE CONTENT ROW IS LEVEL WITH THE CLOCK, NOT BELOW IT —
                §5.5's correction. It used to be pushed under a status-bar
                band, which pinned the message to the bottom of a 78pt slab.
                The status bar is cleared HORIZONTALLY by `visorCap`.
              */}
              <Animated.View style={[styles.headRow, { marginTop: layout.headTop, height: layout.headHeight }, headStyle]}>
                {layout.icon === 'left' ? <Glyph tone={msg.tone} fg={look.fg} /> : <View style={{ width: 0 }} />}
                {!layout.titleDrops && msg.tone !== 'live' ? (
                  <Text numberOfLines={1} style={[styles.title, { color: ISLAND.ink, marginLeft: ICON_GAP }]}>
                    {msg.title}
                  </Text>
                ) : null}
                {/*
                  ⚠️ THE SPACER SEPARATES A TITLE FROM ITS FIGURE. With no
                  title — the live state is a ring and a figure — it pushes the
                  two apart across the whole visor instead, which §5.5 draws
                  as `◎  17m`, adjacent.
                */}
                {layout.titleDrops || msg.tone === 'live' ? null : <View style={{ flex: 1 }} />}
                {msg.value ? (
                  <Text numberOfLines={1} style={[styles.value, styles.mono, { color: look.fg }]}>{msg.value}</Text>
                ) : null}
                {layout.icon === 'right' ? <Glyph tone={msg.tone} fg={look.fg} /> : null}
              </Animated.View>

              {/* ⚠️ Below the lens — never beside it. */}
              {layout.titleDrops || msg.body || msg.action ? (
                <Animated.View style={[styles.drop, bodyStyle]}>
                  {layout.titleDrops ? <Text style={[styles.title, { color: ISLAND.ink }]}>{msg.title}</Text> : null}
                  {msg.body ? <Text numberOfLines={3} style={[styles.body, { color: ISLAND.dim }]}>{msg.body}</Text> : null}
                  {msg.action ? (
                    <Pressable onPress={msg.action.onPress} accessibilityRole="button" style={styles.action}>
                      <Text style={[styles.actionLabel, { color: look.fg }]}>{msg.action.label}</Text>
                    </Pressable>
                  ) : null}
                </Animated.View>
              ) : null}
            </Pressable>
          ) : null}
        </Animated.View>
        </GestureDetector>
      </View>
    </>
  );

  /** Both (or all three) measurements are in — decide and go. */
  function maybeCommit() {
    const p = pending;
    if (!p) return;
    if (p.body && widths.current.bodyLines === 0) return;
    /* ⚠️ `live` never measures a title — see `commit`. */
    if (p.tone !== 'live' && widths.current.title === 0 && p.title.length > 0) return;
    commit(p);
  }
}

function lineWidth(e: NativeSyntheticEvent<TextLayoutEventData>): number {
  return e.nativeEvent.lines.reduce((m, l) => Math.max(m, l.width), 0);
}

/**
 * ⚠️ `live` IS A RING, NOT A GLYPH. It is the state the island holds all day,
 * and a filled icon sitting on the camera for eight hours reads as an alert
 * that nobody can clear.
 */
function Glyph({ tone, fg }: { tone: Tone; fg: string }) {
  if (tone === 'live') {
    return <View style={[styles.ring, { borderColor: fg }]} />;
  }
  return <Ionicons name={ICONS[tone]} size={ICON - 3} color={fg} />;
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
  drop: { paddingHorizontal: SIDE, paddingBottom: 14, gap: 6 },
  title: { fontSize: 15, lineHeight: 21, fontWeight: '500', color: ISLAND.ink },
  body: { fontSize: 13, lineHeight: 19, color: ISLAND.dim },
  value: { fontSize: 14, lineHeight: 20 },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontVariant: ['tabular-nums'] },
  ring: { width: ICON - 5, height: ICON - 5, borderRadius: 999, borderWidth: 2 },
  action: {
    alignSelf: 'flex-start', marginTop: 4, paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: ISLAND.line,
  },
  actionLabel: { fontSize: 13, fontWeight: '500' },
});
