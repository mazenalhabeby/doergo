import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/theme-context';
import { over } from '../../theme/amazen';
import { AText } from './text';
import { TAB_GLYPHS, TabMoreGlyph, type TabGlyphProps } from '../glyphs/tab-glyphs';
import { TourTarget } from '../tour';

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
  ⚠️ THE CAPSULE IS THE FIXED ONE, AND THE MARKS SHARE THE REST.

  This is the inverse of the obvious arrangement and it took a round of device
  screenshots to see why. Fixing the MARKS and letting the capsule grow into
  the remainder also holds geometry still — there are always four marks and one
  capsule — but it makes the capsule 158pt on a 390pt phone, which is nearly
  twice the reference's 90pt and reads as a slab with a small word adrift in it.

  Fixed capsule, marks on `flex: 1`:

    390pt phone   inner 350   capsule 108   each mark 58.5   ← the reference's 59
    360pt phone   inner 320   capsule 108   each mark 51
    430pt phone   inner 390   capsule 108   each mark 68

  The capsule is identical on every tab and every phone; the marks split what
  is left, and there are always exactly four of them. Nothing resizes when the
  selection moves.

  ⚠️ 108 AND NOT THE REFERENCE'S 90, by 18pt. 90 leaves 43pt of label, which
  fits "Home" (the word the reference happens to show) and truncates German
  "Aufträge" at 57pt. 108 leaves 61pt and every label in all five languages
  fits. A capsule measured off the shortest word in the shortest language is
  how the other four end up clipped.
*/
const CAPSULE_W = 108;
const GAP = 2;
/** A mark never goes below this, however narrow the phone. */
const MIN_MARK_W = 40;
/** The row's own left padding — the capsule's origin. */
const PAD = 6;

/**
 * How far the scrim reaches ABOVE the pill.
 *
 * The bar floats over the content now, so something has to take the content
 * from legible to gone before it reaches the pill. 56pt is about two list
 * rows: enough that a line of text is already faint by the time the pill
 * covers it, short enough that it does not eat the screen.
 */
const SCRIM_RISE = 56;

/*
  THE BAR'S OWN GEOMETRY, AND THE ONLY PLACE IT IS WRITTEN DOWN.

  ⚠️ THE BAR IS NOT A FIXED HEIGHT. It sits on the safe-area inset, and that
  inset is different on every device the app runs on:

      Android, gesture navigation   24pt
      Android, three buttons        48pt
      iPhone with a home indicator  34pt
      iPhone without one             0pt  (floored to 12)

  A screen reserving a CONSTANT is therefore right on exactly one of them. The
  constant was 110: on three-button Android the bar is 132pt and 22pt of the
  last row was behind it, and on every notched iPhone it was 8pt short. Both
  are invisible in a simulator set to the one device the number was measured
  on, which is how it survived.
*/
const BAR_PAD_TOP = 6;
const BAR_ROW = 62;
/** How far the pill floats above the inset. */
const BAR_LIFT = 16;
/** An iPhone SE has no inset at all; the bar still may not touch the edge. */
const BAR_INSET_FLOOR = 12;
/** A row must STOP clear of the bar, not end exactly against it. */
const BAR_CLEARANCE = 8;

/** What the bar occupies, bottom-up, for a given safe-area inset. */
export function tabSafeFor(bottomInset: number) {
  return (
    BAR_PAD_TOP + BAR_ROW + BAR_LIFT + Math.max(bottomInset, BAR_INSET_FLOOR) + BAR_CLEARANCE
  );
}

/**
 * Bottom padding for a scrolling tab screen.
 *
 * ⚠️ EVERY SCROLLING TAB SCREEN MUST USE THIS. The bar is absolutely
 * positioned, so React Navigation measures it as zero and leaves the scene the
 * whole window. A screen that forgets hides its last row behind the pill with
 * nothing on screen to explain it. `tab-safe.spec.ts` fails if one does.
 */
export function useTabSafe() {
  return tabSafeFor(useSafeAreaInsets().bottom);
}

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

/**
 * How the bar moves.
 *
 * ⚠️ ONE MOVEMENT, NOT FIVE. The capsule slides; everything else crossfades
 * under it. A bar where the tint slides AND the icons hop AND the labels
 * bounce is four things competing for the same 180ms, and the eye reads none
 * of them — it just reads "busy".
 *
 * `enter` (180ms) rather than `state` (120ms): 120 is right for a colour or an
 * opacity, and far too quick for a ~250pt slide, which at that speed reads as
 * a jump rather than a movement. The easing is the system's one curve.
 *
 * ⚠️ `ReduceMotion.System` on every animation. Somebody who has asked their
 * phone to stop moving things has asked this too, and Reanimated will collapse
 * these to an instant change on its own — but only if it is told.
 */
/**
 * ⚠️ A SPRING, THE SAME ONE FOR EVERY MOVING PART, AND IT NEVER OVERSHOOTS.
 *
 * `withTiming` was right for a fade and wrong for this: the capsule is an
 * object being pushed across a surface by a thumb, and a curve that starts and
 * stops at fixed times reads as a slide-show rather than a movement, however
 * well chosen the bezier.
 *
 * ⚠️ BUT `dampingRatio: 0.92` WAS A BUG, NOT A FLOURISH. Just under critical
 * is lovely on a thing that moves — and this spring also drives a WIDTH. An
 * overshooting width means the slot you just left shrinks past its mark size
 * and comes back, so its mark rocks left and right after the tint has already
 * gone. On a row of five, that reads as the bar settling down after you, which
 * is exactly the fidget a tab bar must not have.
 *
 * Critically damped, and clamped as well: `dampingRatio: 1` alone still allows
 * a hair of numerical overshoot, and on a layout property a hair is visible.
 *
 * ⚠️ AND IT IS SHARED. The capsule's position and every slot's width are
 * driven by this exact config, which is the only reason they stay aligned
 * frame by frame: two springs with different parameters would drift apart in
 * the middle of the transition and the tint would run ahead of its own slot.
 */
const SLIDE = {
  duration: 340,
  dampingRatio: 1,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
} as const;
const TINT = {
  duration: 120,
  easing: Easing.bezier(0.2, 0.8, 0.2, 1),
  reduceMotion: ReduceMotion.System,
} as const;

/*
  ⚠️ EVERY ANIMATION GETS ITS OWN COPY OF THE CONFIG. This is not style.

  Reanimated FREEZES an object once it has been shared to the UI thread, and
  `withSpring` / `withTiming` write their running state onto the config they
  are handed — so passing the module-level constant directly crashed the
  screen the second time it animated:

    "You attempted to set the key `current` with the value `undefined` on an
     object that is meant to be immutable and has been frozen."

  A fresh object per call costs nothing and cannot be frozen out from under
  the animation. The constants stay constants; only copies are handed out.
*/
const slide = () => ({ ...SLIDE });
const tint = () => ({ ...TINT });

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

/**
 * Every slot's width, in points, from the pill's own measured width.
 *
 * ⚠️ MEASURED AND DIVIDED, NOT FLEXED — and that is a correction, not a
 * preference. `flex: 1` on the marks looked right and shipped wrong: two of
 * the five slots are wrapped in a `TourTarget` (a plain `View`, so a COLUMN),
 * and a `flex: 1` child of a column flexes its HEIGHT — its width falls back
 * to content. The wrapped and unwrapped slots then resolved differently, the
 * row came out wider than the pill, and **More was pushed off the right edge
 * entirely**.
 *
 * A number each slot is simply told cannot do that. It also means the two
 * tour-wrapped tabs and the three plain ones are laid out by the same
 * arithmetic, which is the actual invariant — not "they both say flex".
 */
export function slotWidths(pillInnerWidth: number): { capsule: number; mark: number } {
  const usable = Math.max(0, pillInnerWidth - 4 * GAP);
  const capsule = Math.min(CAPSULE_W, Math.max(0, usable - 4 * MIN_MARK_W));
  const mark = Math.max(MIN_MARK_W, (usable - capsule) / 4);
  return { capsule, mark };
}

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
      ? [{ key: '__more__', name: '__more__', label: more.label, focused: more.focused, badge: more.badge, onPress: more.onPress }]
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
                shadowOpacity: 0.12,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 6 },
                elevation: 8,
              }
            : {
                shadowColor: '#000',
                shadowOpacity: 0.4,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
              }),
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
  );
}

function TabSlot({
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
