import React, { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/theme-context';

/**
 * The dot in the eyebrow.
 *
 * ⚠️ It breathes ONLY while somebody is actually on the clock. A pulse that
 * never stops is decoration, and decoration that moves is the first thing that
 * stops being read.
 *
 * ⚠️ `prefers-reduced-motion` — RN's equivalent is
 * `AccessibilityInfo.isReduceMotionEnabled`. The halo then sits at its resting
 * opacity and does not animate at all.
 */
export function LiveDot({
  color,
  live = false,
  size = 8,
}: {
  color: string;
  live?: boolean;
  size?: number;
}) {
  const { amazen } = useTheme();
  const halo = useSharedValue(live ? 0.35 : 0);
  const [reduce, setReduce] = React.useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);

  useEffect(() => {
    cancelAnimation(halo);
    if (!live) { halo.value = 0; return; }
    if (reduce) { halo.value = 0.35; return; }
    halo.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 1100, easing: Easing.bezier(...amazen.motion.easing) }),
        withTiming(0.18, { duration: 1100, easing: Easing.bezier(...amazen.motion.easing) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(halo);
  }, [live, reduce, halo, amazen.motion.easing]);

  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }));

  return (
    <View style={{ width: size + 8, height: size + 8, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size + 8,
            height: size + 8,
            borderRadius: amazen.radius.full,
            backgroundColor: color,
          },
          haloStyle,
        ]}
      />
      <View style={{ width: size, height: size, borderRadius: amazen.radius.full, backgroundColor: color }} />
    </View>
  );
}
