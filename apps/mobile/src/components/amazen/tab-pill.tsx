import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/theme-context';
import { TourTarget } from '../tour/tour-target';
import {
  BAR_INSET_FLOOR, BAR_LIFT, BAR_PAD_TOP, BAR_ROW, GAP, PAD, SCRIM_RISE, slotWidths,
} from './tab-pill/geometry';
import { slide } from './tab-pill/motion';
import { TabSlot } from './tab-pill/tab-slot';

export { tabSafeFor, useTabSafe, slotWidths } from './tab-pill/geometry';

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

export function TabPill({
  items,
  more,
  style,
}: {
  items: TabPillItem[];
  /** The overflow, when there is anything in it. */
  more?: { label: string; focused: boolean; badge?: number; onPress: () => void };
  style?: ViewStyle;
}) {
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
      ? [{ key: '__more__', name: '__more__', label: more.label, focused: more.focused, badge: more.badge, onPress: more.onPress, tourKey: 'tab-more' }]
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

  return (
    <View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: bottomInset,
          paddingTop: BAR_PAD_TOP,
          paddingHorizontal: 14,
        },
        style,
      ]}
    >
      {/*
        THE SCRIM.

        The bar floats over the content, so the content has to go somewhere as
        it arrives underneath. A hard edge — which is what a solid band is —
        chops a row in half and reads as a broken screen; a fade reads as the
        page continuing past the bar, which is the truth.

        ⚠️ IT STARTS AT THE CANVAS WITH ZERO ALPHA, NOT AT `'transparent'`.
        On Android `'transparent'` is rgba(0,0,0,0), and interpolating to an
        opaque colour drags every stop through BLACK — a dark grey bruise
        across the top of the fade that does not exist on iOS. Fading a colour
        to its own zero-alpha self is the only way both platforms agree.
      */}
      <LinearGradient
        pointerEvents="none"
        colors={[`${c.canvas}00`, `${c.canvas}b8`, c.canvas]}
        locations={[0, 0.55, 1]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: BAR_ROW + bottomInset + SCRIM_RISE,
        }}
      />
      {/*
        ⚠️ THE SHADOW LIVES ON A WRAPPER, NOT ON THE PILL. The pill needs
        `overflow: hidden` to clip its blur to the radius, and on iOS
        `overflow: hidden` clips the view's OWN shadow too — so the light-mode
        shadow this bar depends on was never drawn (09.png).
      */}
      <View
        style={{
          borderRadius: amazen.radius.full,
          backgroundColor: c.barFill,
          /*
            ⚠️ THE SHADOW IS LOAD-BEARING IN LIGHT MODE.

            An opaque near-white pill on a pale page is 1.05:1 against its own
            ground — with no shadow there is no bar, just a row of marks
            floating on the page. In dark it is the opposite: the pill is
            LIGHTER than the canvas and separates on its own, so the shadow
            there is only depth.

            `elevation` alongside, or Android draws no shadow at all and light
            mode loses the edge on exactly the platform that already looked
            worst.
          */
          ...(amazen.scheme === 'light'
            ? {
                shadowColor: '#0b332a',
                shadowOpacity: 0.14,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }
            : {
                shadowColor: '#000',
                shadowOpacity: 0.4,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
              }),
        }}
      >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: BAR_ROW,
          borderRadius: amazen.radius.full,
          /*
            ⚠️ `overflow: hidden` IS WHAT MAKES IT A PILL.

            The blur behind it is a RECTANGLE — it knows nothing about the
            radius — so without this the glass is a square sitting behind a
            rounded row, which on a dark ground reads as a rendering fault
            rather than a design.
          */
          overflow: 'hidden',
          backgroundColor: c.barFill,
          // ⚠️ NO BORDER. The references have none, and a hairline on a pill
          // over a gradient reads as a seam at the top and nothing at the
          // bottom. The shadow below does the separating instead.
          paddingHorizontal: 6,
          gap: GAP,
          /*
            No `justifyContent`: the capsule's `flexGrow` already consumes every
            spare point, so there is no slack to distribute. Centring here would
            do nothing on a wide phone and fight the grow on a narrow one.
          */
        }}
        onLayout={(e) => {
          // The row's own width, less its padding — what there actually is to
          // divide. Re-measured on rotation and on a foldable opening.
          const next = e.nativeEvent.layout.width - 12;
          if (Math.abs((inner ?? -1) - next) > 0.5) setInner(next);
        }}
      >
        {/*
          THE CAPSULE, ONCE.

          ⚠️ Not one per slot. Five capsules taking turns being visible is a
          flash; one that moves is a movement, and it is the whole feel of the
          bar. It sits behind the row and is never a touch target — the slots
          are above it and take every press.
        */}
        {w ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: (62 - 37) / 2,
                width: w.capsule,
                height: 37,
                borderRadius: amazen.radius.full,
                backgroundColor: c.barCapsule,
              },
              capsuleStyle,
            ]}
          />
        ) : null}

        {/*
          ⚠️ NOTHING RENDERS UNTIL THE PILL HAS BEEN MEASURED.

          An earlier cut drew the slots at width 0 and hid the row with
          `opacity: 0` for that frame. That is worse than it sounds: the marks
          carry a `LinearTransition`, so the 0 → real width change was itself
          ANIMATED, and the opacity flipped to 1 part-way through it — you saw
          the tail of five slots growing. The row lays out at its own height
          regardless of children, so there is nothing to lose by waiting.
        */}
        {w ? slots.map((it) =>
          it.tourKey ? (
            /*
              ⚠️ The wrapper has to carry BOTH the slot's sizing and its
              alignment, or it silently changes the thing it is only supposed
              to be measuring: without the width the marks stop dividing the
              remainder, and without `alignItems` the slot stretches to the
              pill's full height.
            */
            <TourTarget
              key={it.key}
              name={it.tourKey}
              /*
                ⚠️ NO WIDTH HERE ANY MORE. The slot animates its own, and a
                fixed width on the wrapper would clamp it — the tint would
                slide while the mark stayed put inside a box that never grew.
                The wrapper measures; it does not size.
              */
              style={{ alignItems: 'center', justifyContent: 'center' }}
            >
              <TabSlot item={it} width={w?.capsule ?? 0} markWidth={w?.mark ?? 0} />
            </TourTarget>
          ) : (
            <TabSlot key={it.key} item={it} width={w?.capsule ?? 0} markWidth={w?.mark ?? 0} />
          ),
        ) : null}
      </View>
      </View>
    </View>
  );
}
