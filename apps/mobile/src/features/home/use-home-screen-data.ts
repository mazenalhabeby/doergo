import React, { useCallback, useState } from 'react';
import { type FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useTabSafe } from '../../components/amazen';
import { displayName } from '../../lib/people';
import { announce, useScreenReader } from '../../hooks/use-a11y';
import { useOffline } from '../../offline/offline-context';
import { connectivity } from '../../offline/connectivity';
import { type Suggestion } from './empty-home';
import { answerFor, useWidgetAnswers } from './answers';
import { useHomeEditing } from './use-home-editing';
import { useHomeLayout } from './use-home-layout';
import { EMPTY_ROWS, widgetTitle, type WidgetRow } from './registry';

/** useHomeScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useHomeScreenData() {
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [picking, setPicking] = useState(false);
  /* Editing is a mode, and `use-home-editing.ts` is all of it. */
  const { editing, enter: enterEdit, leave: leaveEdit, landed, land } = useHomeEditing();
  /* The list, to bring the first new card into view (a gesture-handler FlatList under the hood). */
  const listRef = React.useRef<Pick<FlatList<WidgetRow>, 'scrollToIndex'>>(null);
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
  const offline = useOffline();
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    /*
      ⚠️ THE PULL IS ASKED FOR HERE, EXPLICITLY. The cards re-read the phone's
      copy when they remount, but a focus inside `HOME_PULL_GAP_MS` of the last
      pull does not pull again — and a pull-down is a member saying "fresher,
      please". Queue first, then the list, so it does not show the server's
      state from before their own unsent change.
    */
    const engine = offline.engine;
    if (engine && connectivity.state === 'online') void engine.flush().then(() => engine.pull('tasks')).catch(() => undefined);
    setRefreshKey((k) => k + 1);
    if (spinner.current) clearTimeout(spinner.current);
    spinner.current = setTimeout(() => setRefreshing(false), 400);
  }, [offline.engine]);

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

  return {
    amazen,
    isDark,
    contentStyle,
    t,
    refreshKey,
    refreshing,
    picking,
    setPicking,
    editing,
    enterEdit,
    leaveEdit,
    landed,
    land,
    listRef,
    layout,
    screenReader,
    onRefresh,
    answers,
    rows,
    suggestions,
    fullName,
    moveBy,
  };
}
