import React, { useCallback, useState } from 'react';
import { BackHandler, Pressable, RefreshControl, StyleSheet } from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  ShadowDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';
import { useAuth } from '../contexts/auth-context';
import { useTheme } from '../contexts/theme-context';
import { Ground, ScreenHeader, useTabSafe } from '../components/amazen';
import { resolveMediaUrl } from '../lib/api';
import { displayName, initialsOf } from '../lib/people';
import { impact, selection } from '../lib/haptics';
import { announce, useScreenReader } from '../hooks/use-a11y';
import { OfflineBanner } from '../offline/components/offline-banner';
import { EmptyHome, type Suggestion } from '../components/home/empty-home';
import { DropSlot, EditableWidget, LIFT_FACTOR } from '../components/home/editable-widget';
import { WidgetGallery } from '../components/home/widget-gallery';
import { answerFor, useWidgetAnswers } from './answers';
import { useHomeEditing } from './use-home-editing';
import { useHomeLayout } from './use-home-layout';
import { EMPTY_ROWS, widgetTitle, type WidgetRow } from './registry';

/**
 * ONE home screen, composed from a registry — and edited in place.
 *
 * There used to be four — `admin-dashboard`, `hybrid-home`, `freelancer-home`,
 * `full-time-home` — each with its own fetching, skeletons and error handling.
 * The duplication was not theoretical: ALL FOUR carried the same "one unguarded
 * call kills the whole screen" bug, because the logic was written four times
 * and fixed once.
 *
 * ⚠️ THERE IS NO ARRANGE SCREEN AND NO LIST OF WIDGET NAMES.
 *
 * The version before this one was a sheet listing "Shift clock", "Crew", "My
 * work" with up/down arrows beside each. It is the obvious build and it is the
 * wrong one, for the reason both platforms settled on years ago: a list of
 * names asks somebody to decide from a word what they can decide from the
 * thing itself. "Is Crew above My work?" is a question about a picture, and
 * the picture is on the screen already. So the card you are looking at is the
 * card you hold, and the card you drag.
 *
 * The arrows did not disappear — they moved to where they belong. Every card
 * carries `accessibilityActions` for Move up / Move down / Take off my home,
 * which is what WCAG 2.5.7 actually asks for: *"all functionality that uses a
 * dragging movement can be achieved by a single pointer without dragging."*
 * They are drawn on screen only when a screen reader is running.
 *
 * ⚠️ A ROW YOU CANNOT SEE MAKES NO REQUEST AT ALL. Entitlement is asked before
 * the component mounts — nothing is visible-then-refused, and nothing fetches
 * to discover it was not allowed.
 */
/** Drawn by the library at the drop index; it takes no props. */
const renderDropSlot = () => <DropSlot />;

/*
  ⚠️ OUT OF THE RENDER PATH. A fresh style object on every render gives the scroll
  view a new identity for its content container and rebuilds the list's own
  props diff for nothing.
*/
const styles = StyleSheet.create({ fill: { flex: 1 } });

export function HomeScreen() {
  const { user } = useAuth();
  const { amazen, isDark } = useTheme();
  const tabSafe = useTabSafe();
  /*
    ⚠️ 14, not `layout.gutter` (20). Measured off the design reference: the
    shift card's edge and the tab pill's are the same 14pt inset, and a column
    that does not line up with the bar under it is the first thing the eye
    catches.

    ⚠️ `paddingTop: 10` IS ROOM FOR WHAT THE FIRST CARD DRAWS OUTSIDE ITSELF.
    The ⊖ sits at `top: -9` and the arrival ring at `top: -3`, so on the FIRST
    row they reach above the content's origin — and a scroll view does not draw
    above its own content. The result was a ring with its top edge sliced off
    and a ⊖ cut in half, on the one card everybody looks at first. CONSTANT in
    both modes: a padding that appeared when edit mode opened would push the
    whole column down under the finger that had just opened it.

    ⚠️ `paddingBottom` IS NOT A CONSTANT. The tab pill sits on the safe-area
    inset — 24pt on gesture Android, 48pt on three buttons, 34pt on a notched
    iPhone, 0 on an iPhone SE — so the room a screen leaves and the room the
    bar takes are read from one place.
  */
  const contentStyle = React.useMemo(
    () => ({ paddingHorizontal: 14, paddingTop: 10, paddingBottom: tabSafe, flexGrow: 1 }),
    [tabSafe],
  );
  const { t } = useTranslation();
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [picking, setPicking] = useState(false);
  /* Editing is a mode, and `use-home-editing.ts` is all of it. */
  const { editing, enter: enterEdit, leave: leaveEdit, landed, land } = useHomeEditing();
  const layout = useHomeLayout();
  const screenReader = useScreenReader();

  /*
    ⚠️ NOTHING HERE NEEDS AN UNDO, AND THAT IS WHY THERE ISN'T ONE.

    §5 asks for `( Saved to your account.    UNDO )` for 30 seconds after every
    change. It was built, it shipped for a day, and it was removed because the
    first person to see it asked what it was for — which is the answer.

    An undo earns its place where the action is hard to reverse. None of these
    are: a move is one drag back, a remove is one tap in the gallery, an add is
    one tap on the ⊖. The line appeared after EVERY change, so rearranging a
    home screen — which is a run of changes — meant it was on screen the whole
    time, over the card below it.

    The rest of §5 stands and is what actually matters: the change is saved the
    instant it is made. ❌ No confirm dialog — nothing here is destructive, a
    removed widget is hidden and its key is kept. ❌ No save button — Done
    closes a mode, it does not commit anything, and a member who backgrounds
    the app mid-arrangement keeps their arrangement.

    ⚠️ AND THE LAYOUT IS STILL NOT A SERVER-SIDE RECORD, which §5 also asks
    for. There is no endpoint. `layout-store.ts` is AsyncStorage, keyed by
    member, and is the only file that knows where the layout lives — the swap
    is two functions and nothing above them. The removed line's own words
    ("Saved to your account") were the only thing on screen claiming otherwise.
  */

  /*
    ⚠️ THE SPINNER IS ON A TIMER BECAUSE NOTHING HERE KNOWS WHEN THE DATA
    LANDED. Each widget owns its own fetching and reports to nobody, which is
    what keeps them independent — so remounting the column is one gesture wired
    to all of them without a coordinator that would have to know what every
    widget fetches. The 400ms is how long the spinner is shown, not a claim
    about when anything arrived.

    ⚠️ AND IT IS CLEARED ON UNMOUNT. A member who pulls and immediately changes
    tab left a timer holding a setter for a screen that is gone.
  */
  const spinner = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (spinner.current) clearTimeout(spinner.current); }, []);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    if (spinner.current) clearTimeout(spinner.current);
    spinner.current = setTimeout(() => setRefreshing(false), 400);
  }, []);

  /*
    ⚠️ ONE HOOK, READ ONCE, FOR EVERY WIDGET — including the ones that are NOT
    on this member's home, because §1's two suggestions and every page of the
    gallery are about exactly those. `answers.ts` holds the reasons: hooks
    cannot be called from a filtered list, and nothing in there may fetch.
  */
  const answers = useWidgetAnswers();

  /*
    ⚠️ NOTHING IS DRAWN UNTIL THE SAVED ORDER HAS LANDED.

    The layout is read from the phone, which takes a tick, and until it does
    `useHomeLayout` composes the DEFAULT order. So a member who had arranged
    their home saw the DEFAULT arrangement first and watched it rearrange
    itself — and a member with an empty home saw the §1 empty state flash
    before their widgets arrived, which reads as "everything is gone".

    An empty column for one frame is not a state worth drawing either way.
  */
  const rows: readonly WidgetRow[] = layout.loading ? EMPTY_ROWS : layout.rows;

  /*
    ⚠️ TWO SUGGESTIONS, CHOSEN HERE AND NOWHERE ELSE.

    The rule was split: this file took the first two off-screen widgets, and
    `EmptyHome` then dropped the ones with no answer. So if the first widget
    had not loaded, the member got ONE suggestion while a perfectly ready third
    one sat unused. §1 asks for two, and for only ones whose data has arrived —
    which means filtering BEFORE taking two, not after.

    ⚠️ A LIVE ANSWER, NEVER THE QUESTION AS A FALLBACK. Letting `line` fall
    back to the widget's question let a widget with nothing to show become a
    suggestion, and the card above it rendered nothing: an orphaned pill
    floating under a gap.
  */
  const suggestions: Suggestion[] = React.useMemo(
    () =>
      layout.offScreen
        .map((row) => ({ row, line: answerFor(answers, row.key).line }))
        .filter((s): s is Suggestion => s.line !== null)
        .slice(0, 2),
    [layout.offScreen, answers],
  );

  const fullName = displayName(user);
  const initials = initialsOf(user);

  /* ── the a11y arrows, which are also the rotor actions ─────────────── */
  const moveBy = useCallback(
    (key: string, direction: 'up' | 'down') => {
      const done = layout.move(key, direction);
      if (!done) return;
      /*
        ⚠️ THE POSITION COMES FROM THE MOVE, NOT FROM `rows`.

        `rows` in this closure is the list BEFORE the move — the state update
        has not landed yet — so reading the new position out of it worked only
        by an offset that had to be right for both directions and was written
        down nowhere. `move` already returns where the widget WAS, 1-based, and
        the new position is one step off it in the direction asked for.
      */
      const at = done.wasAt + (direction === 'up' ? -1 : 1);
      const row = rows.find((r) => r.key === key);
      const name = row ? widgetTitle(row, t) : key;
      /*
        ⚠️ ANNOUNCE THE RESULT, NOT THE ACT. "Moved up" tells somebody what
        they just did, which they know. "Crew, position 2 of 4" tells them
        where it ended up, which is the only thing they cannot see.
      */
      announce(
        t('home.edit.announce', {
          name,
          at,
          of: rows.length,
          defaultValue: `${name}, position ${at} of ${rows.length}.`,
        }),
      );
    },
    [layout, rows, t],
  );

  const removeWidget = useCallback((key: string) => layout.hide(key), [layout]);

  /*
    ⚠️ `onDragEnd` FIRES ONCE, WITH THE NEW ORDER — §7. It is where the change
    is written and where the undo starts. Not `onPlaceholderIndexChange`, which
    fires on every crossing and would write a dozen records for one gesture.
  */
  const onDragEnd = useCallback(
    ({ data, from, to }: { data: WidgetRow[]; from: number; to: number }) => {
      if (from === to) return;
      layout.setOrder(data.map((r) => r.key));
      impact('medium');
    },
    [layout],
  );

  const renderItem = useCallback(
    ({ item, getIndex, drag, isActive }: RenderItemParams<WidgetRow>) => {
      const index = getIndex() ?? 0;
      return (
        /*
          ⚠️ THE TWO DECORATORS §7 NAMES, AND NO ROTATION. Neither platform
          tilts a dragged card — a tilt says "torn loose", and this one is
          still in a column that is about to close around it.
        */
        <ScaleDecorator activeScale={LIFT_FACTOR}>
          {/* ⚠️ FED THE GLASS SHADOW — the same numbers `shadowGlass()` gives
              every card in the kit, so a lifted card is lit like the cards it
              is being lifted out of rather than like a generic list row. */}
          <ShadowDecorator
            elevation={isDark ? 6 : 4}
            radius={isDark ? 24 : 22}
            color={isDark ? '#000' : '#0b332a'}
            opacity={isDark ? 0.45 : 0.1}
          >
            <EditableWidget
              key={`${item.key}:${refreshKey}`}
              row={item}
              editing={editing}
              isActive={isActive}
              drag={drag}
              onEnterEdit={enterEdit}
              onRemove={removeWidget}
              onMove={moveBy}
              canUp={index > 0}
              canDown={index < rows.length - 1}
              screenReader={screenReader}
              landed={landed === item.key}
            />
          </ShadowDecorator>
        </ScaleDecorator>
      );
    },
    [editing, enterEdit, isDark, landed, moveBy, refreshKey, removeWidget, rows.length, screenReader],
  );

  return (
    <Ground variant="home">
      {/*
        ⚠️ OUTSIDE THE LIST, so it does not scroll away — and so nothing put in
        it can move the column. That second reason is why the ＋ lives here:
        a dashed "Add a widget" row at the head of the column was worth about
        60pt and shoved every widget down the instant the mode opened, under
        the finger that had just opened it.
      */}
      <ScreenHeader
        title={fullName}
        hint={
          editing
            ? t('home.edit.hint', { defaultValue: 'Hold to move · tap ⊖ to remove' })
            : undefined
        }
        avatarUrl={resolveMediaUrl(user?.avatarUrl)}
        initials={initials}
        onPressAvatar={() => router.push('/(app)/(tabs)/profile' as Href)}
        actions={
          editing
            ? [
                {
                  /*
                    ⚠️ A SYMBOL, BECAUSE TWO WORDS DO NOT FIT BESIDE A NAME.
                    "＋ Add a widget" and "Done" together pushed the member's
                    own name into an ellipsis — JOHN OWN…
                  */
                  label: '＋',
                  a11yLabel: t('home.edit.add', { defaultValue: 'Add a widget' }),
                  onPress: () => setPicking(true),
                },
                {
                  label: t('common.done', { defaultValue: 'Done' }),
                  active: true,
                  onPress: () => leaveEdit(),
                },
              ]
            : undefined
        }
      />

      <DraggableFlatList
        /* ⚠️ The library's prop is a mutable `T[]`; it never writes to it. */
        data={rows as WidgetRow[]}
        keyExtractor={(row) => row.key}
        renderItem={renderItem}
        onDragEnd={onDragEnd}
        /* ⚠️ A TICK EACH TIME A CARD CROSSES ANOTHER — it is the only signal
           that the order under the thumb actually changed. */
        onPlaceholderIndexChange={selection}
        renderPlaceholder={renderDropSlot}
        /*
          ⚠️ IT FIGHTS THE iOS BACK-SWIPE. Without a distance the pan claims
          the touch immediately, so an edge swipe to go back is read as a drag
          and the member is stuck on a screen the whole platform says they can
          leave. A distance turns it into `activeOffsetY`, so a horizontal
          move is never a drag.
        */
        activationDistance={14}
        /* §3 — auto-scroll within 60pt of an edge. */
        autoscrollThreshold={60}
        containerStyle={styles.fill}
        /*
          ⚠️ 14, not `layout.gutter` (20). Measured off the design reference:
          the shift card's edge and the tab pill's are the same 14pt inset, and
          a column that does not line up with the bar under it is the first
          thing the eye catches.
        */
        contentContainerStyle={contentStyle}
        ListHeaderComponent={
          /* ⚠️ ONE line that says what the network is doing, for the whole
             column. Per widget it would be four copies of one sentence. */
          <OfflineBanner style={{ marginBottom: amazen.space(3) }} />
        }
        ListEmptyComponent={
          /*
            ⚠️ NOT "your home screen is empty", AND NOT A DASHED OUTLINE.

            A dashed outline means *something belongs here and is missing*.
            Nothing is broken — the member chose this — and two REAL cards at
            .42 are a better invitation than an outline of one. They are the
            same components with the same data, so the suggestion and the thing
            it suggests can never drift.
          */
          <EmptyHome
            suggestions={suggestions}
            totalAvailable={layout.available.length}
            onKeep={(key) => { layout.show(key); }}
            onKeepBoth={() => {
              suggestions.filter((s) => s.line !== null).forEach((s) => layout.show(s.row.key));
            }}
            onSeeAll={() => setPicking(true)}
          />
        }
        ListFooterComponent={
          editing ? (
            /*
              ⚠️ LEAVING IS "DONE, OR A TAP ANYWHERE THAT IS NOT A CARD" — and
              this is that anywhere. Every card absorbs its own taps, so the
              only thing left to hit is the space under the column; giving it a
              floor means there is always some, even when the widgets fill the
              screen. It is also the room the bottom card needs to be dragged
              past, and it is BELOW everything, so adding it moves nothing.
            */
            <Pressable
              onPress={() => leaveEdit()}
              accessibilityRole="button"
              accessibilityLabel={t('common.done', { defaultValue: 'Done' })}
              style={{ minHeight: 180 }}
            />
          ) : null
        }
        refreshControl={
          /*
            ⚠️ NO PULL-TO-REFRESH WHILE EDITING, and this was a real bug: a
            widget near the top dragged DOWNWARD triggered the refresh spinner
            instead of moving, because `RefreshControl` claims a downward
            gesture whenever the list is at the top — before the pan can
            decide. It is also the wrong offer: somebody rearranging their home
            screen is not asking for fresher numbers.
          */
          editing ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={amazen.color.accent}
            />
          )
        }
        showsVerticalScrollIndicator={false}
        /*
          ⚠️ ANDROID-ONLY, AND ONLY BECAUSE A WIDGET CAN BE DRAGGED. Subview
          clipping DETACHES a child once it leaves the visible window — and a
          card under a finger is translated well outside its own slot, so the
          thing being dragged is exactly the thing that gets detached.
        */
        removeClippedSubviews={false}
      />

      {/*
        ⚠️ THE GALLERY SHOWS THE WIDGET, NEVER A LABEL. One per page, swiped
        sideways, the real component at full size with real data.
      */}
      <WidgetGallery
        visible={picking}
        onClose={() => setPicking(false)}
        offScreen={layout.offScreen}
        hasData={(row) => answerFor(answers, row.key).ready}
        onAdd={(key) => {
          /*
            ⚠️ THE SHEET CLOSES SO THE ARRIVAL IS VISIBLE, and the card lands
            at the BOTTOM wearing a jade ring. Closing it is the point: a card
            that appears behind a sheet has not arrived anywhere anybody can
            see, and "it worked" then has to be taken on trust.
          */
          layout.add(key);
          setPicking(false);
          land(key);
        }}
      />
    </Ground>
  );
}
