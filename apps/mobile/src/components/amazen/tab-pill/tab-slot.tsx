import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../../contexts/theme-context';
import { over } from '../../../theme/amazen';
import { AText } from '../text';
import { TAB_GLYPHS, TabMoreGlyph, type TabGlyphProps } from '../../glyphs/tab-glyphs';
import { slide, tint } from './motion';
import type { TabPillItem } from '../tab-pill';

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
  const { amazen } = useTheme();
  const c = amazen.color;
  const Glyph: React.ComponentType<TabGlyphProps> =
    item.name === '__more__' ? TabMoreGlyph : (TAB_GLYPHS[item.name] ?? TabMoreGlyph);

  /*
    ⚠️ TWO GLYPHS STACKED, NOT ONE GLYPH CHANGING COLOUR.

    The mark is SVG and its `stroke` is a plain string prop — there is no
    animating it without wrapping every path in an animated SVG component,
    which is a lot of machinery for a colour. Drawing the jade copy on top of
    the muted one and fading its opacity gets a true crossfade for one extra
    element, and the two are pixel-identical so nothing shifts.
  */
  const jade = useSharedValue(item.focused ? 1 : 0);
  React.useEffect(() => {
    jade.value = withTiming(item.focused ? 1 : 0, tint());
  }, [item.focused, jade]);
  const jadeStyle = useAnimatedStyle(() => ({ opacity: jade.value }));

  /*
    ⚠️ THE WIDTH IS ANIMATED, and that is the whole difference.

    It used to change in one frame: the outgoing slot snapped from 108 to 46
    and the incoming one from 46 to 108, so every mark in the row jumped
    sideways instantly while the tint slid smoothly behind them. Two motions,
    one of them a cut — which is what "not smooth" actually was. The tint was
    never the problem.

    On the SAME spring as the capsule, so the tint and the slot it is filling
    move as one thing.

    ⚠️ Width is a layout property, so this costs a layout pass per frame on the
    native side — which is exactly why there are five of these and not fifty,
    and why `LinearTransition` was removed rather than added to: that ran a
    layout animation on the mark as WELL, for the same pixels.
  */
  const grow = useSharedValue(item.focused ? 1 : 0);
  React.useEffect(() => {
    grow.value = withSpring(item.focused ? 1 : 0, slide());
  }, [item.focused, grow]);
  const growStyle = useAnimatedStyle(() => ({
    width: interpolate(grow.value, [0, 1], [markWidth, width]),
  }));

  /*
    The label rides the SAME value — no mount, no unmount, no entering.

    `FadeIn`/`FadeOut` meant React added and removed an element in the middle
    of the transition: a render, a reconciliation and a layout pass on the JS
    thread, in the frames where the UI thread is trying to run a spring. That
    is where a dropped frame comes from, and it is the one place in this bar
    where it is avoidable for free.

    It stays mounted and its opacity is interpolated. It only starts appearing
    once the slot is 45% open, so the word arrives INTO the space rather than
    on top of it.
  */
  /*
    ⚠️ THE LABEL'S OWN WIDTH IS ANIMATED TOO, from nothing to what it measures.

    Without it the word still occupies layout while invisible, so the mark sits
    off-centre in a narrow slot — pushed left by half a word nobody can see.

    ⚠️ AND IT IS MEASURED BY A COPY THAT IS NEVER CLIPPED. Measuring the real
    label cannot work and fails silently: it lives inside a container this
    animation squeezes to zero, and a child of a zero-width `overflow: hidden`
    parent lays out at zero — so `onLayout` reported 0, the guard rejected it,
    the width stayed 0, and the word never appeared on any tab that became
    active after mount. The tint moved, the capsule opened, and it was empty.

    The measuring copy is absolutely positioned, so it is outside the flow and
    outside the clip, and invisible to both the eye and a screen reader.
  */
  const [labelW, setLabelW] = React.useState(0);
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(grow.value, [0.45, 1], [0, 1], 'clamp'),
    width: labelW ? interpolate(grow.value, [0, 1], [0, labelW]) : undefined,
  }));

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
    <Animated.View
      style={[
        growStyle,
        {
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
          flexGrow: 0,
          flexShrink: 0,
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
            <Glyph size={21} color={c.accent} />
          </Animated.View>
          {item.badge ? <Badge count={item.badge} /> : null}
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
    </Animated.View>
  );
}

/**
 * ⚠️ A badge is a COUNT, never a dot, and it caps at 9+. "Something is
 * waiting" without a number is a thing to check; 3 is a thing to plan around,
 * and past nine the exact number stops changing the decision.
 *
 * ⚠️ And a badge must never be the only reason a request happens. If nothing
 * else on screen already knows the count, the tab draws no number rather than
 * firing a call to decorate itself.
 */
function Badge({ count }: { count: number }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View
      style={{
        position: 'absolute',
        top: -4,
        right: -8,
        minWidth: 17,
        height: 17,
        paddingHorizontal: 4,
        borderRadius: amazen.radius.full,
        backgroundColor: c.warn,
        alignItems: 'center',
        justifyContent: 'center',
        /*
          The ring is the PILL, composited.

          ⚠️ Not `canvas` and not `tile`. The pill is `tile` over `canvas`, and
          that composite is a third value — in dark, #ffffff14 over #040507 is
          #18191a, which is visibly lighter than the canvas it sits on. A ring
          drawn in either ingredient reads as a halo rather than a cut-out.
        */
        borderWidth: 2,
        borderColor: over(c.tile, c.canvas),
      }}
    >
      <AText variant="caption" numeric style={{ color: c.warnInk, fontSize: 10, lineHeight: 14 }}>
        {count > 9 ? '9+' : String(count)}
      </AText>
    </View>
  );
}
