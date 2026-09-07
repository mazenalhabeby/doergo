import { type ReactNode, useCallback, useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedStyle, useSharedValue, withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS } from '../../lib/constants';

/**
 * A sheet that lives ON the map instead of over it.
 *
 * Every other sheet in this app is a BlurSheet: a modal that dims what is
 * behind it and is dismissed to get back. That is right for a decision and
 * wrong for a map, where the thing behind the sheet IS the content — you drag
 * the sheet down to look at the route and back up to read the stops, and the
 * map stays live the whole time. This is the pattern every mapping and
 * ride-hailing app converged on for exactly that reason.
 *
 * Detents are content stages, not round numbers: peek shows the summary and
 * the action, mid shows the first few stops, full is the list. It never
 * reaches the top of the screen — a sheet that covers the map has become a
 * page, and the map is why anyone opened this.
 *
 * ⚠️ ONLY THE HEADER DRAGS. Letting the body drag as well means arbitrating
 * between the pan and the scroll on every touch, which is the part of this
 * pattern that goes subtly wrong — a list that sometimes scrolls and sometimes
 * drags the sheet, depending on velocity. The grabber is a large, obvious
 * target and the body then belongs entirely to the list.
 */

export type Detent = 'peek' | 'mid' | 'full';

export function DetentSheet({
  header,
  children,
  detent,
  onDetentChange,
  peekHeight,
  backgroundColor,
  borderColor,
  grabberColor,
}: {
  /** Always visible, and the only draggable surface. */
  header: ReactNode;
  children: ReactNode;
  detent: Detent;
  onDetentChange: (d: Detent) => void;
  /** How much of the sheet shows at rest — measured from its own header. */
  peekHeight: number;
  backgroundColor: string;
  borderColor: string;
  grabberColor: string;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Top edge of the sheet, as a Y coordinate. Bigger = lower on screen.
  const FULL = Math.max(insets.top + 56, height * 0.14);
  const MID = height * 0.46;
  const PEEK = Math.max(MID, height - peekHeight);

  const yFor = useCallback(
    (d: Detent) => (d === 'full' ? FULL : d === 'mid' ? MID : PEEK),
    [FULL, MID, PEEK],
  );

  const y = useSharedValue(yFor(detent));
  const startY = useSharedValue(0);

  /*
    The screen can move the sheet too — optimizing a route opens it to show the
    result. Driven off the `detent` prop so there is one source of truth, and
    guarded so it never fights a drag already in flight.
  */
  useEffect(() => {
    y.value = withSpring(yFor(detent), { damping: 22, stiffness: 220, mass: 0.6 });
  }, [detent, yFor, y]);

  const pan = Gesture.Pan()
    .onStart(() => { startY.value = y.value; })
    .onUpdate((e) => {
      // Clamped so it can neither be flung off the bottom nor cover the map.
      y.value = Math.min(PEEK, Math.max(FULL, startY.value + e.translationY));
    })
    .onEnd((e) => {
      // Velocity decides before position does: a deliberate flick should reach
      // the next detent even when the finger barely moved.
      const projected = y.value + e.velocityY * 0.12;
      const distances: [Detent, number][] = [
        ['full', Math.abs(projected - FULL)],
        ['mid', Math.abs(projected - MID)],
        ['peek', Math.abs(projected - PEEK)],
      ];
      distances.sort((a, b) => a[1] - b[1]);
      const next = distances[0]![0];
      y.value = withSpring(yFor(next), { damping: 22, stiffness: 220, mass: 0.6 });
      runOnJS(onDetentChange)(next);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <Animated.View
      style={[
        styles.sheet,
        /*
          Exactly as tall as the sheet can ever be shown, never the whole
          screen. `translateY` is the sheet's TOP edge, so a full-height box
          hangs its own bottom off the screen at every detent — at the tallest
          one that put the end of the list permanently out of reach, with the
          scroll view showing no more to scroll because its frame was fine.
        */
        { height: height - FULL, backgroundColor, borderColor },
        sheetStyle,
      ]}
      // Let taps through to the map above the sheet's own top edge.
      pointerEvents="box-none"
    >
      <GestureDetector gesture={pan}>
        <View style={styles.headerArea}>
          <View style={[styles.grabber, { backgroundColor: grabberColor }]} />
          {header}
        </View>
      </GestureDetector>
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    // A wide, soft shadow lifts the sheet off the map without a hard edge.
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  headerArea: {
    paddingTop: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  body: {
    flex: 1,
  },
});
