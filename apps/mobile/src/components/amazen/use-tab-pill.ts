import React from 'react';
import { type ViewStyle } from 'react-native';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/theme-context';
import { BAR_INSET_FLOOR, BAR_LIFT, GAP, PAD, slotWidths } from './tab-pill/geometry';
import { slide } from './tab-pill/motion';

/**
 * The bar at the bottom, as a floating pill.
 *
 * ⚠️ THE HANDOFF NEVER SPECIFIES THIS SURFACE, but it specifies two things
 * about it, and together they leave only one shape: `TOKENS.md` gives the tab
 * bar `radius-full`, and every screen reserves `space-tabsafe: 110` below its
 * content. An edge-to-edge bar needs neither — it ends the screen and costs
 * its own height. A pill floats, and the gradient runs underneath it.
 *
 * Every number below was MEASURED off the design reference at 390pt, not
 * chosen. Two of them landed exactly on existing tokens, which is how we know
 * the reference was drawn from this same palette:
 *
 *   the pill's fill      #191c20 over #040507  =  `tile`     #ffffff14
 *   the active capsule   #283736 over that     =  `accentTint` #66dbba24
 *   the inactive mark    #828b95               =  `inkMuted` #808b95
 *
 * ⚠️ ONLY THE ACTIVE TAB CARRIES ITS WORD. The four you are not on are marks
 * alone. It survives the rule that icons never carry meaning by themselves
 * because these five are always the same five in the same order — recognised
 * by position long before shape — and because the label is still read out:
 * `accessibilityLabel` carries it whether or not it is drawn.
 *
 * ⚠️ AND NOTHING RESIZES WHEN YOU CHOOSE ONE. Both widths are CONSTANTS, not
 * content-driven: the capsule is always `CAPSULE_W` and an inactive mark is
 * always `SLOT_W`, whichever tab is selected and whatever language it is in.
 * There are always exactly one of the first and four of the second, so the row
 * cannot re-flow — selecting a tab moves the capsule, it does not resize
 * anything.
 *
 * That is the whole reason the capsule is a fixed width rather than hugging
 * its word. "Nachrichten" is nearly three times "Home", so a capsule sized to
 * its label would jump by 60pt between two adjacent taps and drag the four
 * marks with it — and the thing you reach for without looking would be
 * somewhere else by the time you looked. The label truncates inside the fixed
 * capsule instead.
 */

/*
  ⚠️ THE BAR WAS GLASS AND IS NOT ANY MORE.

  `BlurView` over the scrolling content looked right on iOS and wrong on
  Android: `dimezisBlurView` re-renders what is behind it at reduced fidelity
  on every frame, so the marks came out smeared and the capsule's edge fuzzy —
  side by side, two different products. It is experimental by its own
  documentation, and this bar is on screen the entire time over the one thing
  people scroll all day, which is the worst case for it.

  No parameter fixes that; the difference is the implementation. So the pill is
  an OPAQUE colour — `barFill`, one per theme, measured off the references.
  It renders identically on both platforms, costs nothing per frame, and reads
  better in light mode, where a translucent bar over a pale page had almost no
  edge at all.

  The scrim below still fades the content. That was never the problem.
*/

export interface TabPillItem {
  key: string;
  /** The route name — also the key into `TAB_GLYPHS`. */
  name: string;
  label: string;
  focused: boolean;
  /** An unread count. Never a dot: a number is a thing to plan around. */
  badge?: number;
  /**
   * The guided tour's name for this slot, when it spotlights it.
   *
   * ⚠️ Passed IN rather than looked up here. A tour target is a measurement of
   * where something is on screen, and the pill is the only thing that knows —
   * but which steps exist is the tour's business, and importing its registry
   * into a presentation component is how the two stop being separable.
   */
  tourKey?: string;
  onPress: () => void;
}

/** TabPill's state and handlers — everything before its markup, moved here unchanged. */
export function useTabPill({
  items,
  more,
  style,
}: Pick<{
  items: TabPillItem[];
  /** The overflow, when there is anything in it. */
  more?: { label: string; focused: boolean; badge?: number; onPress: () => void };
  style?: ViewStyle;
}, 'items' | 'more' | 'style'>) {
  const { amazen } = useTheme();
  const insets = useSafeAreaInsets();
  const c = amazen.color;
  /*
    Null until the pill has been measured. The row renders invisible for that
    one frame rather than laying itself out at a guessed width and jumping —
    a tab bar that snaps into place on every mount is worse than one that
    appears a frame late.
  */
  const [inner, setInner] = React.useState<number | null>(null);
  /*
    ⚠️ MEMOISED ON THE MEASUREMENT, not recomputed each render.

    `slotWidths()` returns a fresh object, so an unmemoised `w` is a new
    identity on every render — and the effect below lists it as a dependency.
    That effect calls `withTiming`, so the capsule's slide was being RESTARTED
    on every render of the bar: it would never finish, and on a busy screen it
    would crawl. A cheap function returning an object is the classic way a
    dependency array quietly stops working.
  */
  const w = React.useMemo(() => (inner === null ? null : slotWidths(inner)), [inner]);

  /*
    One flat list, so the capsule's position is arithmetic rather than a
    lookup: every slot BEFORE the active one is a mark, so its left edge is
    simply `PAD + index × (mark + GAP)`.
  */
  /*
    Not memoised on purpose: `items` is built inline by the caller, so its
    identity changes every render and a `useMemo` here would be a cache that
    never hits — the hook's own cost with none of its benefit. Concatenating
    five objects is cheaper than comparing them.
  */
  const slots: TabPillItem[] = [
    ...items,
    ...(more
      ? [
          {
            key: '__more__',
            name: '__more__',
            label: more.label,
            focused: more.focused,
            badge: more.badge,
            onPress: more.onPress,
            tourKey: 'tab-more',
          },
        ]
      : []),
  ];
  const activeIndex = Math.max(0, slots.findIndex((s) => s.focused));

  const x = useSharedValue(0);
  React.useEffect(() => {
    if (!w) return;
    const target = PAD + activeIndex * (w.mark + GAP);
    /*
      ⚠️ The first placement JUMPS, every later one slides. Animating from 0 on
      mount would send the capsule flying in from the left edge every time the
      bar is created — on every cold start, and on every remount behind a
      modal.
    */
    x.value = x.value === 0 ? target : withSpring(target, slide());
  }, [activeIndex, w, x]);

  const capsuleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  /*
    ⚠️ ABSOLUTE, AND EVERY TAB SCREEN PAYS FOR IT.

    This was in flow for a while, and in flow is genuinely safer: the scene
    stops above the bar and no screen can hide its last row. But it makes the
    bar a solid band welded to the bottom of the page, and a band has an EDGE —
    a hard line where the content is chopped off mid-row, which is what
    `08.png` shows.

    Glass only means anything if there is something behind it, and a fade only
    means anything if there is something to fade. So the bar floats, the
    content runs underneath it, the scrim takes that content from legible to
    gone, and the pill blurs whatever is passing.

    ⚠️ THE PRICE: React Navigation measures a custom tab bar to decide how much
    room to leave a scene, and an absolutely positioned one measures ZERO. Every
    scrolling tab screen therefore has to reserve `layout.tabSafe` itself, and
    one that forgets hides its last row behind the pill with nothing on screen
    to explain it. There is a test that says so.
  */
  const bottomInset = Math.max(insets.bottom, BAR_INSET_FLOOR) + BAR_LIFT;

  return {
    amazen,
    c,
    inner,
    setInner,
    w,
    slots,
    capsuleStyle,
    bottomInset,
  };
}
