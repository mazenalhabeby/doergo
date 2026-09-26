import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Reanimated, {
  Easing, interpolateColor, useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/theme-context';

const AnimatedPath = Reanimated.createAnimatedComponent(Path);

const SIZE = 36;
/** The tick's own length, rounded up — the dash that draws it. */
const TICK_LEN = 20;

/**
 * ⭐ THE RING THAT CLOSES — Done, on a row that finishes an errand.
 *
 * At rest an empty ring: it reads as a CHECKBOX beside the jade act, never as
 * a second action competing with it. Tapped, the ring fills jade from the
 * centre with a little overshoot, the tick draws itself, and one soft pulse
 * runs out — then the row steps aside for its undo line.
 *
 * ⚠️ Animated styles and props only — never a Reanimated `layout`/`entering`
 * prop (they corrupted the home column on Android).
 */
export function DoneRing({ done, onPress, label }: { done: boolean; onPress: () => void; label: string }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const p = useSharedValue(done ? 1 : 0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (done) {
      p.value = withSpring(1, { damping: 11, stiffness: 240, mass: 0.7 });
      pulse.value = 0;
      pulse.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
    } else {
      p.value = withTiming(0, { duration: 160 });
    }
  }, [done, p, pulse]);

  const fill = useAnimatedStyle(() => ({ transform: [{ scale: p.value }] }));
  const ring = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, p.value) }));
  const burst = useAnimatedStyle(() => ({
    opacity: pulse.value > 0 && pulse.value < 1 ? 0.8 * (1 - pulse.value) : 0,
    transform: [{ scale: 0.6 + 0.75 * pulse.value }],
  }));
  const tick = useAnimatedProps(() => {
    // The tick waits for the fill to be under way, then draws itself.
    const drawn = Math.max(0, Math.min(1, (p.value - 0.35) / 0.65));
    return {
      strokeDashoffset: done ? TICK_LEN * (1 - drawn) : 0,
      stroke: interpolateColor(Math.min(1, p.value), [0, 1], [c.inkMuted, c.accentInk]),
    };
  });

  return (
    <Pressable
      onPress={done ? undefined : onPress}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: SIZE, height: SIZE, transform: [{ scale: pressed && !done ? 0.9 : 1 }] })}
    >
      <Reanimated.View pointerEvents="none" style={[{ position: 'absolute', left: -6, top: -6, right: -6, bottom: -6, borderRadius: SIZE, borderWidth: 2, borderColor: c.accent }, burst]} />
      <Reanimated.View style={[{ position: 'absolute', left: 1, top: 1, right: 1, bottom: 1, borderRadius: SIZE, borderWidth: 1.6, borderColor: `${c.ink}66` }, ring]} />
      <Reanimated.View style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: SIZE, backgroundColor: c.accentSolid }, fill]} />
      <View style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <Svg width={SIZE} height={SIZE} viewBox="0 0 36 36">
          <AnimatedPath
            d="M12.2 18.4l3.9 3.9 7.8-8.4"
            fill="none"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${TICK_LEN} ${TICK_LEN}`}
            animatedProps={tick}
          />
        </Svg>
      </View>
    </Pressable>
  );
}
