import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/theme-context';
import { SPACING } from '../lib/constants';

/**
 * The same colour, fully transparent.
 *
 * `'#0c0c14' + '00'` is a valid 8-digit hex and is all this needs for the theme
 * backgrounds it is given today — but a caller passing `rgb(…)`, a 3-digit hex
 * or a named colour would produce a string the native layer silently refuses,
 * and the fade would simply not appear. Widening it here is cheaper than
 * debugging an invisible gradient.
 */
function transparent(color: string): string {
  const hex = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return `${hex}00`;
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const [, r, g, b] = hex.match(/^#(.)(.)(.)$/i)!;
    return `#${r}${r}${g}${g}${b}${b}00`;
  }
  if (/^#[0-9a-f]{8}$/i.test(hex)) return `${hex.slice(0, 7)}00`;
  const rgb = hex.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const [r, g, b] = rgb[1]!.split(',').map((n) => n.trim());
    return `rgba(${r}, ${g}, ${b}, 0)`;
  }
  // Unknown form (a named colour): fall back to a transparent black, which
  // fades to nothing rather than drawing a visible bar of the wrong hue.
  return 'rgba(0,0,0,0)';
}

/**
 * A horizontally scrolling row of chips that says so.
 *
 * The filter row scrolled, and the only hint was a chip clipped by the screen
 * edge — which reads as a layout bug at least as often as it reads as "there is
 * more". Nobody should have to try dragging something to find out whether
 * dragging does anything.
 *
 * A fade at each scrollable edge answers three questions without a word:
 *
 *   CAN I SCROLL?    a fade exists at all
 *   WHICH WAY?       which side it is on
 *   AM I AT THE END? it disappears when you get there
 *
 * The last one is why this measures rather than always drawing a fade: a row
 * whose chips all fit shows nothing, so the fade never lies. A permanent
 * gradient would be decoration, and people learn to ignore decoration.
 *
 * The gradient fades to the screen's own background, so it reads as content
 * running out of the frame rather than as a grey bar drawn on top of it.
 */
export function ChipRow({
  children,
  style,
  /** Matches the surface behind the row. Defaults to the screen background. */
  fadeColor,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  fadeColor?: string;
}) {
  const { colors } = useTheme();
  const ground = fadeColor ?? colors.background;
  const clear = transparent(ground);

  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Kept in refs, not state: they change together on layout and re-rendering
  // twice would make the fade flicker on first paint.
  const viewportWidth = useRef(0);
  const contentWidth = useRef(0);
  const offset = useRef(0);

  const recompute = useCallback(() => {
    // A few pixels of slack, so a rounding error at either end does not leave a
    // fade hanging over content that has actually run out.
    const SLACK = 4;
    setCanLeft(offset.current > SLACK);
    setCanRight(offset.current + viewportWidth.current < contentWidth.current - SLACK);
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = e.nativeEvent.contentOffset.x;
      recompute();
    },
    [recompute],
  );

  return (
    <View style={[s.wrap, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // A horizontal ScrollView has no intrinsic height in a flex column;
        // without this it gets squeezed by whatever follows it.
        style={s.scroller}
        contentContainerStyle={s.content}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={(e) => {
          viewportWidth.current = e.nativeEvent.layout.width;
          recompute();
        }}
        onContentSizeChange={(w) => {
          contentWidth.current = w;
          recompute();
        }}
      >
        {children}
      </ScrollView>

      {/* pointerEvents none, or the fades would swallow taps on the chips
          underneath them — which are exactly the chips hardest to reach. */}
      {canLeft && (
        <LinearGradient
          colors={[ground, clear]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[s.fade, s.fadeLeft]}
          pointerEvents="none"
        />
      )}
      {canRight && (
        <LinearGradient
          colors={[clear, ground]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[s.fade, s.fadeRight]}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative' },
  scroller: { flexGrow: 0, flexShrink: 0 },
  content: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
    alignItems: 'center',
  },
  fade: { position: 'absolute', top: 0, bottom: 0, width: 32 },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
});
