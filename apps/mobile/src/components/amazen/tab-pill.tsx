import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/theme-context';
import { over } from '../../theme/amazen';
import { AText } from './text';
import { TAB_GLYPHS, TabMoreGlyph, type TabGlyphProps } from '../home/tab-glyphs';
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
const SLIDE = {
  duration: 180,
  easing: Easing.bezier(0.2, 0.8, 0.2, 1),
  reduceMotion: ReduceMotion.System,
};
const TINT = { duration: 120, easing: Easing.bezier(0.2, 0.8, 0.2, 1), reduceMotion: ReduceMotion.System };

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
    x.value = x.value === 0 ? target : withTiming(target, SLIDE);
  }, [activeIndex, w, x]);

  const capsuleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  /*
    ⚠️ IN FLOW, NOT ABSOLUTE — and this was measured, not assumed.

    A floating pill suggests `position: absolute` with the screen running full
    height behind it. Sampling the reference says otherwise: the band around
    the pill is #05080a, which is the CANVAS, not the gradient. The home
    gradient's last stop is #040507, so by the bottom of the screen it has
    already resolved to canvas and there is nothing to see through.

    That one fact is worth a lot. Absolute positioning would put the content of
    every tab screen written before v2 underneath this — each of them would
    need `space-tabsafe` added by hand, and the ones that were missed would
    hide their last row behind the pill with nothing on screen to explain it.
    In flow, it looks identical and no screen changes.
  */
  return (
    <View
      style={[
        {
          backgroundColor: c.canvas,
          // 28pt of air below the pill — measured. The home indicator lives in
          // it on a phone that has one, so it is a floor, not an addition.
          paddingBottom: Math.max(insets.bottom, 12) + 16,
          paddingTop: 6,
          paddingHorizontal: 14,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 62,
          borderRadius: amazen.radius.full,
          // ⚠️ NO BORDER. The reference has none, and a hairline on a
          // translucent pill over a gradient reads as a seam at the top and
          // nothing at the bottom.
          backgroundColor: c.tile,
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
                backgroundColor: c.accentTint,
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
              style={{
                width: it.focused ? w?.capsule : w?.mark,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TabSlot item={it} width={(it.focused ? w?.capsule : w?.mark) ?? 0} />
            </TourTarget>
          ) : (
            <TabSlot key={it.key} item={it} width={(it.focused ? w?.capsule : w?.mark) ?? 0} />
          ),
        ) : null}
      </View>
    </View>
  );
}

function TabSlot({ item, width }: { item: TabPillItem; width: number }) {
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
    jade.value = withTiming(item.focused ? 1 : 0, TINT);
  }, [item.focused, jade]);
  const jadeStyle = useAnimatedStyle(() => ({ opacity: jade.value }));

  return (
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
      style={({ pressed }) => [
        {
          /*
            The capsule is a constant; the marks divide the remainder. Never
            content-sized — a capsule that hugged its label would be 90pt on
            "Home" and 150pt on "Nachrichten", and every tab would sit
            somewhere different depending on which one you were on.

            Press feedback is opacity rather than a scale transform. A
            transform on this row judders, and it would be the only thing on
            the bar that moves.
          */
          width,
          flexGrow: 0,
          flexShrink: 0,
          /*
            ⚠️ 37pt, AND `alignSelf` SO IT STAYS 37pt.

            Without it the slot inherits the row's `alignItems` and stretches
            to the pill's full 62pt — which is exactly what happened to Jobs
            and Time and to nothing else, because those two are the tabs the
            guided tour spotlights and so the only two wrapped in a
            `TourTarget`. A capsule two different heights depending on whether
            a tour step happens to point at it is the kind of bug that looks
            like a rendering glitch.
          */
          height: 37,
          alignSelf: 'center',
          borderRadius: amazen.radius.full,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: item.focused ? 6 : 0,
          paddingHorizontal: item.focused ? 10 : 0,
          opacity: pressed ? 0.7 : 1,
        },
        /* ⚠️ No background here. The tint is ONE shared capsule behind the
           row — see `TabPill`. A per-slot background would flash rather than
           slide, and the two drawn together would double up mid-animation. */
      ]}
    >
      {/*
        ⚠️ `LinearTransition` on the mark, because the LABEL changes the
        layout beside it. When a tab becomes active the label appears and the
        row re-centres, which would otherwise snap the mark ~20pt sideways in
        a single frame. This carries it across instead, on the same curve and
        the same 180ms as the capsule — so the mark rides WITH the tint
        rather than arriving before it.
      */}
      <Animated.View layout={LinearTransition.duration(SLIDE.duration).easing(SLIDE.easing)}>
        <Glyph size={21} color={c.inkMuted} />
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, jadeStyle]}>
          <Glyph size={21} color={c.accent} />
        </Animated.View>
        {item.badge ? <Badge count={item.badge} /> : null}
      </Animated.View>
      {item.focused ? (
        /*
          The label is MOUNTED only while active, and enters a beat after the
          capsule starts moving — the tint arrives first and the word settles
          into it. Out is quicker than in: a word leaving should not be
          something you watch.
        */
        <Animated.View
          entering={FadeIn.duration(SLIDE.duration).delay(60).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(90).reduceMotion(ReduceMotion.System)}
          style={{ flexShrink: 1 }}
        >
          <AText
            variant="caption"
            numberOfLines={1}
            /* Truncates inside the fixed capsule. The alternative is a capsule
               that changes width per language, which is the thing this avoids. */
            /*
              ⚠️ `flexShrink` AND `minWidth: 0` on the TEXT ITSELF, not only on
              its wrapper. On Android a `<Text>` in a row does not ellipsize
              from a shrinking parent — it overflows the capsule and is clipped
              mid-letter. iOS is forgiving here and Android is not, which is
              exactly the kind of difference that ships.
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
        </Animated.View>
      ) : null}
    </Pressable>
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
