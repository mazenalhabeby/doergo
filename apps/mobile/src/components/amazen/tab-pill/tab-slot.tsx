import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/theme-context';
import { AText } from '../text';
import { slide, tint } from './motion';
import { Bump } from '../motion';
import type { TabPillItem } from '../tab-pill';
import { useTabSlot } from './use-tab-slot';
import { CountBadge } from '../count-badge';

/*
  ⚠️ THERE IS NO `AnimatedPressable` HERE, AND THAT WAS TRIED FIRST.

  Reanimated freezes the object `useAnimatedStyle` returns, and a plain
  `Pressable` handed one tries to attach its own bookkeeping to it — the whole
  screen goes blank with "You attempted to set the key `current` … frozen",
  which reads nothing like a styling error.

  `createAnimatedComponent(Pressable)` fixes that and introduces a quieter
  problem: `Pressable` takes its style as a FUNCTION, and an animated component
  does not evaluate one. The animated width was silently dropped — no crash, no
  warning, every slot at its static width.

  An animated wrapper around a plain Pressable has neither failure.
*/

/** One slot of the pill: the capsule when active, a mark when not. */
export function TabSlot({
  item,
  width,
  markWidth,
}: {
  item: TabPillItem;
  /** The width this slot has when ACTIVE. */
  width: number;
  /** The width it has when it is not. */
  markWidth: number;
}) {
  const {
    amazen,
    c,
    Glyph,
    jadeStyle,
    markBadgeStyle,
    capsuleBadgeStyle,
    growStyle,
    labelW,
    setLabelW,
    labelStyle,
  } = useTabSlot({ item, width, markWidth });

  return (
    /*
      ⚠️ THE ANIMATION AND THE PRESS ARE TWO ELEMENTS, and that is not an
      arbitrary split.

      The width comes from `useAnimatedStyle`, and `Pressable` takes its style
      as a FUNCTION — `({ pressed }) => …` — which an animated component does
      not evaluate. Wrapping the animated style in that function silently
      dropped it: no crash, no warning, just every slot at its static width and
      a bar collapsed into the left corner.

      So the outer view animates and the inner one presses. Each does one
      thing, and neither can quietly swallow the other.
    */
    <Animated.View style={[growStyle, { height: 37, alignSelf: 'center', flexGrow: 0, flexShrink: 0 }]}>
      {/*
      ⚠️ TWO LAYERS: this outer one carries the animated width and does NOT clip,
      so the open tab's count can sit on the capsule's corner; the inner one
      below clips (the label slides out of the mark).
    */}
      <View
        style={[
          {
            flex: 1,
            height: 37,
            /*
            ⚠️ `alignSelf` SO IT STAYS 37pt. Without it the slot inherits the
            row's `alignItems` and stretches to the pill's full 62 — which is
            exactly what happened to Jobs and Time and to nothing else, because
            those two are the tabs the guided tour spotlights and so the only
            two wrapped in a `TourTarget`.
          */
            alignSelf: 'center',
            borderRadius: amazen.radius.full,
            /*
            ⚠️ `overflow: hidden` MAKES THE LABEL SLIDE OUT OF THE MARK. The
            word is there the whole time; it is revealed by the slot widening
            rather than appearing on top of it. One motion instead of a fade
            layered over a jump.
          */
            overflow: 'hidden',
          },
        ]}
      >
        {/*
        The ruler. Absolute, so nothing it does affects layout; `opacity: 0`
        and `accessibilityElementsHidden` so it is drawn for no one.
      */}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', opacity: 0, left: 0, top: 0 }}
          onLayout={(e) => {
            const next = e.nativeEvent.layout.width;
            if (next > 0 && Math.abs(next - labelW) > 0.5) setLabelW(next);
          }}
        >
          <AText
            variant="caption"
            numberOfLines={1}
            style={{ fontSize: 13, lineHeight: 17, fontFamily: amazen.font.sansMedium, paddingLeft: 6 }}
          >
            {item.label}
          </AText>
        </View>

        <Pressable
          onPress={item.onPress}
          accessibilityRole="tab"
          /* The label is read out even when it is not drawn — the four inactive
           marks are unlabelled to the eye and must not be to a screen reader. */
          accessibilityLabel={item.badge ? `${item.label}, ${item.badge}` : item.label}
          accessibilityState={{ selected: item.focused }}
          /*
          ⚠️ THE SLOT IS 37pt TALL AND THE MINIMUM TARGET IS 44.

          37 is the measured height of the capsule and it is the right VISUAL —
          a 44pt tint in a 62pt pill leaves no air. So the target is grown
          without growing the drawing: 8pt top and bottom takes it to 53, and
          the horizontal slop closes the 2pt gaps so there is no dead strip
          between two tabs for a thumb to land in.

          This bar is used outdoors, in gloves.
        */
          hitSlop={{ top: 8, bottom: 8, left: 1, right: 1 }}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            /*
            ⚠️ CONSTANT, not `focused ? … : …`. It used to flip in a single
            frame in the middle of the spring — one more cut underneath a
            smooth motion. The gap lives inside the label's own animated
            width, and 10pt fits the mark at either size (10 + 21 + 10 = 41,
            inside the 46pt mark slot).
          */
            paddingHorizontal: 10,
            /* Opacity, not a scale transform: a transform on a box whose width
             is already animating judders. */
            opacity: pressed ? 0.7 : 1,
          })}
        >
          {/*
          ⚠️ NO LAYOUT ANIMATION ON THE MARK, and it used to have one.

          `LinearTransition` carried the mark across as the label pushed it — a
          second animation, on the same pixels, competing with the width spring
          for the same frames. Now the slot's own width animates, the mark is
          centred in it, and it is carried for free by a motion that was
          happening anyway. One animation is smoother than two agreeing with
          each other.
        */}
          <View>
            <Glyph size={21} color={c.inkMuted} />
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, jadeStyle]}>
              <Glyph size={21} color={c.accent} filled />
            </Animated.View>
          </View>

          {/*
          ⚠️ ALWAYS MOUNTED, never conditional — see `labelStyle`. It costs a
          hidden <Text> per slot and buys a transition with no React work in it
          at all: no mount, no reconciliation, no layout pass on the JS thread
          in the frames where the UI thread is running a spring.
        */}
          <Animated.View style={[{ overflow: 'hidden' }, labelStyle]}>
            <View style={{ paddingLeft: 6 }}>
              <AText
                variant="caption"
                numberOfLines={1}
                /*
                ⚠️ `flexShrink` AND `minWidth: 0` on the TEXT ITSELF, not only
                on its wrapper. On Android a <Text> in a row does not ellipsize
                from a shrinking parent — it overflows and is clipped
                mid-letter. iOS is forgiving here and Android is not.
              */
                style={{
                  color: c.accent,
                  fontSize: 13,
                  lineHeight: 17,
                  fontFamily: amazen.font.sansMedium,
                  flexShrink: 1,
                  minWidth: 0,
                }}
              >
                {item.label}
              </AText>
            </View>
          </Animated.View>
        </Pressable>
      </View>
      {/*
      The closed tab's count: on the icon's top-right corner. Drawn HERE, outside the
      clipping layer — inside it, the rounded clip sliced the count into a blob.
      The mark is centred in a closed slot, so its corner is half the slot's width
      plus half the 21pt glyph, and 8pt down (37pt slot, 21pt glyph).
    */}
      {item.badge ? (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: 0, left: markWidth / 2 + 1 }, markBadgeStyle]}
        >
          <CountBadge count={item.badge} ring={c.barFill} />
        </Animated.View>
      ) : null}
      {/* The open tab's count: on the capsule's top-right corner, cross-faded with the mark's. */}
      {item.badge ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -7, right: -3 }, capsuleBadgeStyle]}>
          <CountBadge count={item.badge} ring={c.barFill} glow />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
