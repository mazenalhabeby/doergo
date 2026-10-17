import React from 'react';
import {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../../contexts/theme-context';
import { TAB_GLYPHS, TabMoreGlyph, type TabGlyphProps } from '../../glyphs/tab-glyphs';
import { slide, tint } from './motion';
import type { TabPillItem } from '../tab-pill';

/** TabSlot's state and handlers — everything before its markup, moved here unchanged. */
export function useTabSlot({
  item,
  width,
  markWidth,
}: Pick<{
  item: TabPillItem;
  /** The width this slot has when ACTIVE. */
  width: number;
  /** The width it has when it is not. */
  markWidth: number;
}, 'item' | 'width' | 'markWidth'>) {
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
  // The count moves with the tab: on the icon's corner when closed, on the capsule's corner when open.
  const markBadgeStyle = useAnimatedStyle(() => ({ opacity: 1 - jade.value }));
  const capsuleBadgeStyle = useAnimatedStyle(() => ({
    opacity: jade.value,
    transform: [{ scale: 0.6 + 0.4 * jade.value }],
  }));

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

  return {
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
  };
}
