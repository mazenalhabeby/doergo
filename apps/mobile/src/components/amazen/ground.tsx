import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/theme-context';
import { useIsland } from '../../island/island-context';

/**
 * The ground every v2 screen stands on.
 *
 * ⚠️ There are TWO gradients and they are not interchangeable. The home one's
 * top stop is lighter, which is why `inkOnGlassHome` exists as a token of its
 * own — text that passes on the interior ground fails on the home one at
 * 4.14:1. Pass the variant; never eyeball it.
 *
 * ⚠️ NO STATUS BAR IS EVER DRAWN. The gradient runs under it, and screens use
 * `layout.topInset` (56) rather than a safe-area background band.
 *
 * ⚠️ AND THAT IS WHY THE ISLAND'S RESERVE BELONGS HERE. While the live shift
 * is showing, the island needs the app's CONTENT to move down — §5.1, §5.5 —
 * but not its ground. Padding the provider's own children did both: it cut
 * the gradient off at the padding and left a black band across the top with
 * the clock and the battery sitting on it, which is precisely what the
 * sentence above forbids and what §5.5 draws the opposite of. The gradient
 * stays full-bleed; only what stands on it moves.
 */
export function Ground({
  variant = 'interior',
  style,
  children,
  ...rest
}: ViewProps & { variant?: 'home' | 'interior' }) {
  const { amazen } = useTheme();
  const g = amazen.gradient;
  const colors = variant === 'home' ? g.home : g.interior;
  const locations = variant === 'home' ? g.homeLocations : g.interiorLocations;

  /* ⚠️ On the same spring as the box, so the app moves WITH it, never jumps. */
  const { reserve } = useIsland();
  const push = useSharedValue(reserve);
  React.useEffect(() => {
    push.value = withSpring(reserve, { damping: 26, stiffness: 240, mass: 1 });
  }, [reserve, push]);
  const pushed = useAnimatedStyle(() => ({ paddingTop: push.value }));

  return (
    <View style={[styles.root, { backgroundColor: amazen.color.canvas }, style]} {...rest}>
      <LinearGradient
        colors={colors as unknown as [string, string, ...string[]]}
        locations={locations as unknown as [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Animated.View style={[styles.root, pushed]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
