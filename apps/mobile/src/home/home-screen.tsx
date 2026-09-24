import React, { useCallback, useState } from 'react';
import { BackHandler, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { Ground, ScreenHeader, WidgetFrame, useTabSafe } from '../components/amazen';
import { resolveMediaUrl } from '../lib/api';
import { displayName, initialsOf } from '../lib/people';
import { OfflineBanner } from '../offline/components/offline-banner';
import { Arrangeable } from '../components/amazen/arrangeable';
import { AText } from '../components/amazen';
import { WidgetPicker } from '../components/home/widget-picker';
import { WidgetPlaceholder } from '../components/home/widget-placeholder';
import { useHomeLayout } from './use-home-layout';
import type { WidgetRow } from './registry';

/**
 * ONE home screen, composed from a registry.
 *
 * There used to be four — `admin-dashboard`, `hybrid-home`, `freelancer-home`,
 * `full-time-home` — each with its own fetching, skeletons and error handling.
 * The duplication was not theoretical: ALL FOUR carried the same "one unguarded
 * call kills the whole screen" bug, because the logic was written four times
 * and fixed once.
 *
 * ⚠️ EACH WIDGET FAILS ALONE. `WidgetFrame` is an error boundary per row, so a
 * widget that cannot load takes itself off the screen and never the shift card
 * beside it.
 *
 * ⚠️ AND A ROW YOU CANNOT SEE MAKES NO REQUEST AT ALL. Entitlement is asked
 * before the component mounts — nothing is visible-then-refused, and nothing
 * fetches to discover it was not allowed.
 *
 * ⚠️ ARRANGING IS A MODE, NOT A SCREEN. The alternative — a settings page
 * listing widget names with checkboxes — asks somebody to imagine the result.
 * Here the thing being arranged is the thing on screen, so the answer to "does
 * this belong above that" is visible while it is being decided. It costs one
 * header button and it is why the drag is worth having at all.
 */
/**
 * One widget, as it appears WHILE ARRANGING.
 *
 * ⚠️ A WIDGET THAT HAS NOTHING TO SAY RENDERS `null`, AND THAT IS RIGHT ON THE
 * HOME SCREEN AND WRONG HERE.
 *
 * "My work" returns nothing when there is no work. A row of zero height is a
 * widget the member cannot see, cannot drag and cannot remove, still holding
 * its place in the order — and its ✕ badge is drawn at the top-left of a box
 * with no height, so it lands on TOP of the next widget's ✕. Two controls in
 * one place, and the one you hit removes the one you cannot see.
 *
 * ⚠️ AND IT RENDERS IN BOTH MODES, WHICH IS THE POINT. Showing the stand-in
 * only while arranging would mean the row grew by 70pt the moment the mode
 * opened, and every widget below it moved — the same rule the add-widget row
 * broke, in miniature. Both phones agree: entering edit mode does not move the
 * content. So the row is the same height whether it is being read or arranged,
 * and the mode change is purely the ✕ badges.
 *
 * It is also the more honest screen. The registry declares `empty: 'allClear'`
 * for this widget — "the answer is genuinely nothing, and that is good" — and
 * a row saying so tells the member their work is clear, where a gap tells them
 * nothing at all.
 *
 * ⚠️ The widget keeps rendering underneath. Swapping it out for the stand-in
 * would make the measured height non-zero, which would swap it back.
 */
/*
  ⚠️ MEMOISED, AND THAT IS ABOUT THE DROP RATHER THAN ABOUT RENDER COUNTS.

  Committing a reorder sets state, so the home screen re-renders — and without
  this, so does every widget on it: the shift clock, my work, documents. On the
  emulator, with placeholders, that is free. On a real phone holding real data
  it is the JS thread busy at the exact moment the member has just let go, and
  nothing moves until it finishes.

  `row` is the registry object, which is the same reference before and after a
  reorder — only its POSITION in the list changes, and position is the parent's
  business. So the widgets sit still and only the column re-arranges.
*/
const ArrangeSlot = React.memo(function ArrangeSlot({ row }: { row: WidgetRow }) {
  const { t } = useTranslation();
  const [quiet, setQuiet] = React.useState(false);
  return (
    <View collapsable={false}>
      <View
        pointerEvents="none"
        /* Android: see the note on the row in `arrangeable.tsx` — a wrapper
           that exists only to be measured is exactly what gets collapsed. */
        collapsable={false}
        onLayout={(e) => setQuiet(e.nativeEvent.layout.height < 1)}
      >
        <row.Component />
      </View>
      {quiet ? (
        <WidgetPlaceholder
          title={t(row.title, { defaultValue: row.key })}
          question={row.question ?? ''}
          height={72}
          /* It IS built — it just has nothing to say today. */
          note={t('home.arrange.quiet', { defaultValue: 'nothing right now' })}
        />
      ) : null}
    </View>
  );
});


export function HomeScreen() {
  const { user } = useAuth();
  const { amazen } = useTheme();
  const tabSafe = useTabSafe();
  const { t } = useTranslation();
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [picking, setPicking] = useState(false);
  const layout = useHomeLayout();
  /* Handed to the drag layer so the scroll view yields to it — see
     `Arrangeable`'s `scrollRef`, which is load-bearing and fails silently. */
  const scrollRef = React.useRef(null);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Each widget owns its own data and re-reads on mount; remounting the
    // column is one gesture wired to all of them without a coordinator that
    // would have to know what every widget fetches.
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  /*
    ⚠️ THE ANDROID BACK GESTURE LEAVES THE MODE, IT DOES NOT LEAVE THE SCREEN.

    Arranging is a mode, and back is what an Android member presses to get out
    of one. Without this it takes them off Home entirely, which reads as the
    app throwing away what they were in the middle of doing — and the
    arrangement IS saved, so it is also a lie.

    It returns `true` only while the mode is on, so every other back press on
    Home behaves exactly as it did. No-op on iOS, which has no hardware back.
  */
  React.useEffect(() => {
    if (!arranging) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setArranging(false);
      return true;
    });
    return () => sub.remove();
  }, [arranging]);

  const rows = layout.rows;
  const fullName = displayName(user);
  const initials = initialsOf(user);

  return (
    <Ground variant="home">
      {/*
        ⚠️ OUTSIDE the ScrollView, so it does not scroll away.

        It names the day and the company, and both stay true while the column
        moves under them. Inside, it would be a greeting that disappears the
        moment somebody looks at their jobs.
      */}
      <ScreenHeader
        /*
          ⚠️ THE PERSON, NOT THE COMPANY.

          The reference shows the organization here, and on a screen for
          somebody who covers three sites that is the more useful line. But a
          member who works for one company reads its name every time they open
          the app and learns nothing — whereas their own name says whose day
          this is, which matters on a shared phone and on a handover.

          The workspace still appears where it is actually a fact: the shift
          card names the site you are clocked into.
        */
        title={fullName}
        avatarUrl={resolveMediaUrl(user?.avatarUrl)}
        initials={initials}
        onPressAvatar={() => router.push('/(app)/(tabs)/profile' as Href)}
        /*
          ⚠️ NOTHING HERE WHILE READING, AND EVERYTHING HERE WHILE ARRANGING.

          The Arrange button is gone: it sat in the header every day of the
          year for something most people do twice. Arranging starts the way it
          already starts on both phones — press and hold a widget.

          ⚠️ AND "ADD A WIDGET" LIVES HERE, NOT IN THE COLUMN. This is the fix
          for the bug that would not go away. Both phones agree on one rule:
          **entering edit mode does not move the content by a single pixel.**
          iOS jiggles the icons where they stand and puts its Edit control in a
          CORNER OF THE CHROME; the Android launcher opens a floating menu over
          a grid that does not shift. A dashed row at the head of the column
          broke that rule by construction — it is worth about 60pt, so it
          shoved every widget down the instant the mode opened, under the
          finger that had just opened it. Hiding it during drags only moved the
          same 60pt to the start of every drag, which is what made a widget
          land a slot away from where it was aimed.

          The header is OUTSIDE the ScrollView. Nothing put here can move the
          column, ever — which is why this is the only place it can go.
        */
        actions={
          arranging
            ? [
                {
                  /*
                    ⚠️ A SYMBOL, BECAUSE TWO WORDS DO NOT FIT BESIDE A NAME.
                    "＋ Add a widget" and "Done" together pushed the member's
                    own name into an ellipsis — JOHN OWN… — which is a worse
                    thing to lose than a word nobody needs to read. iOS uses a
                    bare ＋ in the corner for exactly this control, and only
                    while editing, where it cannot be misread.
                  */
                  label: '＋',
                  a11yLabel: t('home.arrange.add', { defaultValue: 'Add a widget' }),
                  onPress: () => setPicking(true),
                },
                {
                  label: t('common.done', { defaultValue: 'Done' }),
                  active: true,
                  onPress: () => setArranging(false),
                },
              ]
            : undefined
        }
      />
      <ScrollView
        ref={scrollRef}
        /*
          ⚠️ ANDROID-ONLY, AND ONLY BECAUSE A WIDGET CAN BE DRAGGED.

          Subview clipping DETACHES a child from the native hierarchy once it
          leaves the visible window, and re-attaches it on the way back. That
          is the right trade for a long list nobody is holding — but a widget
          under a finger is translated well outside its own slot, so the thing
          being dragged is exactly the thing that gets detached. On screen the
          card vanishes and comes back.

          Off for this column. It is six rows; there is nothing to win by
          clipping them, and iOS never did it anyway.
        */
        removeClippedSubviews={false}
        contentContainerStyle={{
          /*
            ⚠️ 14, not `layout.gutter` (20). Measured off the design reference:
            the shift card's edge and the tab pill's are the same 14pt inset,
            and a column that does not line up with the bar under it is the
            first thing the eye catches.
          */
          paddingHorizontal: 14,
          /*
            ⚠️ THIS SCREEN DRAWS UNDER THE TAB PILL LIKE EVERY OTHER TAB.

            The comment that used to be here said the pill renders in flow and
            therefore no room was needed. That stopped being true when the bar
            was made to float: it is absolutely positioned, React Navigation
            measures it as zero, and home was the one tab screen reserving
            nothing — so the shortcuts row ended under the glass.

            `useTabSafe()` and not a constant: the bar sits on the safe-area
            inset, which is 24pt on gesture Android, 48pt on three buttons,
            34pt on a notched iPhone and 0 on an iPhone SE.
          */
          paddingBottom: tabSafe,
        }}
        /*
          ⚠️ NO PULL-TO-REFRESH WHILE ARRANGING, and this was a real bug: a
          widget near the top dragged DOWNWARD triggered the refresh spinner
          instead of moving, because `RefreshControl` claims a downward gesture
          whenever the list is at the top — before the pan can decide.

          It is also the wrong offer. Somebody rearranging their home screen is
          not asking for fresher numbers, and a refresh mid-arrangement
          remounts the very widgets being moved.
        */
        refreshControl={
          arranging ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={amazen.color.accent}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      >
        {/*
          ⚠️ ONE line that says what the network is doing, for the whole
          column. Per widget it would be four copies of the same sentence; per
          screen it is the context every widget's own freshness label reads
          against.
        */}
        <OfflineBanner style={{ marginBottom: amazen.space(3) }} />


        {/*
          ⚠️ ONE COLUMN, TWO MODES, AND THE SAME WIDGETS IN BOTH.

          Reading renders the widgets directly; arranging wraps them in the
          drag layer. It is deliberately the same components either way — a
          separate "edit" representation is how an arrangement ends up looking
          different from the thing it arranges, and then the order somebody
          chose is not the order they get.
        */}
        <Arrangeable
          keys={rows.map((r) => r.key)}
          arranging={arranging}
          onBeginArrange={() => setArranging(true)}
          onMove={layout.move}
          gap={amazen.layout.block}
          scrollRef={scrollRef}
        >
          {(key, i) => {
            const row = rows.find((r) => r.key === key);
            if (!row) return null;
            /*
              Reading: the widget, exactly as it is. The drag layer is still
              wrapped around it — that is what the hold needs — but it does
              nothing until the hold has been held.
            */
            if (!arranging) {
              return (
                <WidgetFrame key={`${row.key}:${refreshKey}`} index={i}>
                  <ArrangeSlot row={row} />
                </WidgetFrame>
              );
            }
            return (
              <View>
                {/* Not interactive while arranging: a tap belongs to the
                    drag, and a widget that navigates away mid-arrangement
                    loses the arrangement. */}
                <ArrangeSlot row={row} />
                <Pressable
                  onPress={() => layout.hide(key)}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.arrange.remove', {
                    defaultValue: 'Remove from home',
                  })}
                  hitSlop={8}
                  style={{
                    position: 'absolute',
                    top: -6,
                    left: -6,
                    width: 28,
                    height: 28,
                    borderRadius: amazen.radius.full,
                    backgroundColor: amazen.color.criticalTint,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: amazen.color.critical,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AText variant="body" tone="critical" style={{ lineHeight: 20 }}>×</AText>
                </Pressable>
              </View>
            );
          }}
        </Arrangeable>

      </ScrollView>

      <WidgetPicker
        visible={picking}
        onClose={() => setPicking(false)}
        offScreen={layout.offScreen}
        total={layout.available.length}
        onAdd={(key) => {
          layout.show(key);
          setPicking(false);
        }}
      />
    </Ground>
  );
}
