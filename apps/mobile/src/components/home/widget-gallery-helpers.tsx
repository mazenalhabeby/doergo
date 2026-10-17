import { View } from 'react-native';
import Reanimated, { interpolateColor, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

/** WidgetGallery's module-level helpers, moved here unchanged so its sections can read them too. */
/** The preview is the real card at this scale, so a whole card fits a page. */
export const SCALE = 0.78;

export const FRAME_H = 300;

/** A page dot that grows as its page arrives, following the finger. */
export function Dot({ i, progress, on, off }: { i: number; progress: SharedValue<number>; on: string; off: string }) {
  const style = useAnimatedStyle(() => {
    const near = Math.max(0, 1 - Math.abs(progress.value - i));
    return { width: 6 + 12 * near, backgroundColor: interpolateColor(near, [0, 1], [off, on]) };
  });
  return <Reanimated.View style={[{ height: 6, borderRadius: 3 }, style]} />;
}
