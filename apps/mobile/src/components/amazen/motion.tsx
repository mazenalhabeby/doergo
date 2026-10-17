import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/*
  Chat's motion on the phone (docs/design/messages-motion.html, approved 2026-10-16).

  ⚠️ NEVER a Reanimated LAYOUT animation (`entering=`): it takes the view out of
  layout while it runs and, on Android, a re-layout in that window leaves views
  where they were (memory: mobile-cross-platform-traps §1). Everything here is
  opacity / translate / scale on shared values — style, not layout — started in
  a layout effect so no frame sits invisible with nothing scheduled to raise it.
  Everything is off when the phone asks for reduced motion.
*/

const SPRING = { damping: 14, stiffness: 220, mass: 0.8 };
const SOFT = Easing.bezier(0.2, 0.8, 0.2, 1);

export type ArriveKind = 'pop' | 'sent' | 'up' | 'right' | 'fade';

const START: Record<ArriveKind, { x: number; y: number; s: number }> = {
  pop: { x: 0, y: 8, s: 0.92 }, // a message from somebody else
  sent: { x: 0, y: 26, s: 0.86 }, // my message rising from the box
  up: { x: 0, y: 8, s: 1 }, // a row in a list
  right: { x: 16, y: 0, s: 1 }, // a page or panel sliding in
  fade: { x: 0, y: 0, s: 1 },
};

/** Its children arrive: from below, from the right, popping — once, when mounted. */
export function Arrive({
  kind = 'up',
  delay = 0,
  enabled = true,
  style,
  children,
}: {
  kind?: ArriveKind;
  delay?: number;
  /** False draws it at rest straight away (history, rows already seen). */
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const calm = useReducedMotion();
  const run = enabled && !calm;
  const from = START[kind];
  const p = useSharedValue(run ? 0 : 1);
  useLayoutEffect(() => {
    if (!run) return;
    const springy = kind === 'pop' || kind === 'sent';
    p.value = withDelay(delay, springy ? withSpring(1, SPRING) : withTiming(1, { duration: 380, easing: SOFT }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.4),
    transform: [
      { translateX: (1 - p.value) * from.x },
      { translateY: (1 - p.value) * from.y },
      { scale: from.s + (1 - from.s) * p.value },
    ],
  }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** A number that pops when it changes while on screen — not when first drawn. */
export function Bump({ value, children }: { value: number | string; children: React.ReactNode }) {
  const calm = useReducedMotion();
  const s = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (calm) return;
    s.value = withSequence(withTiming(0.5, { duration: 0 }), withSpring(1, { damping: 8, stiffness: 260 }));
  }, [value, calm, s]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

/** "…is typing": three dots in a wave. */
export function WaveDots({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <WaveDot key={i} delay={i * 150} color={color} />
      ))}
    </View>
  );
}
function WaveDot({ delay, color }: { delay: number; color: string }) {
  const calm = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (calm) return;
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 330 }),
          withTiming(0, { duration: 330 }),
          withTiming(0, { duration: 440 }),
        ),
        -1,
      ),
    );
  }, [calm, delay, y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: 0.5 + -y.value / 10 }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, a]} />;
}

export type IconMotion = 'swing' | 'fly' | 'pop' | 'tilt' | 'bob' | 'nudge';

/**
 * An icon's own motion, played on press: the bell swings, the plane flies out
 * and back, a picture tilts. Wrap the icon in `<Animated.View style={style}>`
 * and call `play()` from the control's onPressIn.
 */
export function useIconMotion(kind: IconMotion) {
  const calm = useReducedMotion();
  const r = useSharedValue(0); // degrees
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const s = useSharedValue(1);
  const o = useSharedValue(1);
  const play = () => {
    if (calm) return;
    const t = (v: number, d: number) => withTiming(v, { duration: d, easing: SOFT });
    if (kind === 'swing') r.value = withSequence(t(16, 120), t(-12, 160), t(7, 160), t(-3, 160), t(0, 160));
    if (kind === 'tilt') {
      r.value = withSequence(t(-12, 200), withSpring(0, SPRING));
      s.value = withSequence(t(1.08, 200), withSpring(1, SPRING));
    }
    if (kind === 'pop') s.value = withSequence(t(1.22, 160), withSpring(1, SPRING));
    if (kind === 'bob') y.value = withSequence(t(-3, 160), t(0.5, 160), t(0, 160));
    if (kind === 'nudge') x.value = withSequence(t(3, 160), t(0, 200));
    if (kind === 'fly') {
      x.value = withSequence(t(10, 170), withTiming(-10, { duration: 0 }), t(0, 220));
      y.value = withSequence(t(-10, 170), withTiming(10, { duration: 0 }), t(0, 220));
      o.value = withSequence(t(0, 170), t(1, 220));
    }
  };
  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${r.value}deg` }, { scale: s.value }],
  }));
  return { style, play };
}
