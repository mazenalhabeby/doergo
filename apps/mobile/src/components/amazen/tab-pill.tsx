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
import { useTabPill, type TabPillItem } from './use-tab-pill';
export { type TabPillItem } from './use-tab-pill';

export { useTabSafe, slotWidths } from './tab-pill/geometry';

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
  const {
    amazen,
    c,
    inner,
    setInner,
    w,
    slots,
    capsuleStyle,
    bottomInset,
  } = useTabPill({ items, more, style });

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
        ⚠️ BELOW THE PILL IS SOLID. The fade is for the content arriving at the
        bar; under it — down to the phone's own buttons — the page must not show
        through, or a half-faded row ("Invitations") sits in that strip and reads
        as the page ignoring the footer (2026-10-14, Android).
      */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bottomInset, backgroundColor: c.canvas }}
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
