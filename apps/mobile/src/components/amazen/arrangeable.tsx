import React from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * A column you can drag into order, where the others move out of the way.
 *
 * ⚠️ THE LIVE GAP IS THE WHOLE FEATURE. A reorder that only happens on release
 * asks somebody to guess where a thing will land and then find out. Every home
 * screen worth copying answers that question WHILE the finger is down: the
 * neighbours part, and the space that opens is the promise.
 *
 * That is why the hovered index lives in a `SharedValue` rather than React
 * state. Every row reads it on the UI thread and decides for itself whether it
 * is standing where the dragged widget is going — sixty times a second, with
 * no render in between. Through React it would be a `setState` per frame of a
 * gesture, which is the one place that cost is unaffordable.
 *
 * ⚠️ NO GRID AND NO FIXED ROW HEIGHT. The shift card is three times the height
 * of the documents row, and every reorder library wanting a uniform
 * `itemHeight` is answering a different question. Each row reports its own.
 *
 * ⚠️ AND NO NEW DEPENDENCY. `react-native-draggable-flatlist` does this, and
 * brings its own list, ref plumbing and opinions about scrolling — for a
 * column of at most eight items that are already rendered.
 */

/**
 * ⚠️ AN INLINE LITERAL AT EVERY CALL SITE, AND IT HAS TO BE — the opposite of
 * the rule in `tab-pill.tsx`, for a reason worth writing down.
 *
 * There the animations start from a `useEffect` on the JS thread, so a
 * `spring()` factory is right: Reanimated freezes a shared config and then
 * writes the animation's own state onto it, so each call needs its own copy.
 *
 * HERE they start inside a GESTURE — a worklet on the UI thread — and a
 * worklet cannot call an ordinary JS function. Calling the factory did not
 * degrade, it killed the process:
 *
 *   FATAL EXCEPTION: main
 *   [Worklets] Tried to synchronously call a non-worklet function `spring`
 *   on the UI thread.
 *
 * A literal spread at the call site is built on the UI thread with nothing to
 * capture, which satisfies both constraints at once.
 */
/**
 * How long a widget has to be held before the column opens for arranging.
 *
 * ⚠️ 520ms, AND IT IS DELIBERATELY LONGER THAN THE SYSTEM'S OWN LONG PRESS.
 *
 * Both platforms recognise a long press at 500ms — iOS
 * `UILongPressGestureRecognizer.minimumPressDuration` defaults to 0.5s, and
 * Android's `ViewConfiguration.getLongPressTimeout()` is 500. This was 450,
 * which is UNDER both: it fired before the member expected it to and caught
 * presses that were the beginning of a scroll.
 *
 * Sitting just above the system number is the convention
 * `react-native-reorderable-list` recommends for the same reason — a gesture
 * that activates at the same instant as the OS's own is a gesture competing
 * with it.
 *
 * One number, both platforms. Splitting them would mean the app behaved
 * differently on two phones on the same desk, which is the thing a member
 * notices and nobody can explain.
 */
const HOLD = 520;

const SPRING = {
  duration: 240,
  dampingRatio: 1,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
} as const;

/**
 * ⚠️ THE FLIGHT HOME IS A TIMING CURVE, NOT A SPRING, AND THE REASON IS THE
 * CALLBACK RATHER THAN THE MOTION.
 *
 * The reorder commits in this animation's completion callback, so however long
 * the animation takes to report `finished` is how long the list stays frozen
 * in drag state after the finger has gone. A spring with `dampingRatio: 1`
 * approaches its target asymptotically and only calls back once it is inside
 * Reanimated's rest thresholds: measured on a real drop, `duration: 240`
 * reported finished after **394ms**. The widget was visibly home after about
 * 100ms and then nothing happened for a third of a second — which reads
 * exactly as a hitch at the moment the gesture should feel resolved.
 *
 * `withTiming` calls back at its duration, to the frame. 170ms of travel, then
 * the commit. Ease-out cubic decelerates into the gap, so it still lands
 * rather than stopping.
 */
const FLIGHT = {
  duration: 170,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;

export interface ArrangeableProps {
  /** Stable keys, in the order they are drawn. */
  keys: string[];
  /**
   * Arranging, or just reading?
   *
   * ⚠️ THE COLUMN IS RENDERED THROUGH THIS COMPONENT IN BOTH MODES, and that
   * is not tidiness — it is what makes the press-and-hold flow straight into a
   * drag. The gesture has to already exist on the row before the mode changes;
   * if reading and arranging were two different trees, the long press would
   * activate, the tree would swap under it, and the gesture would be torn down
   * at the exact moment the finger started to move. The member would hold,
   * feel the mode open, and then have to let go and grab again.
   */
  arranging: boolean;
  /**
   * The hold has been held. Turn the mode on — the same finger keeps dragging.
   */
  onBeginArrange: () => void;
  /**
   * A finger is down on a widget, or it has just let go.
   *
   * ⚠️ THE COLUMN MUST NOT CHANGE HEIGHT WHILE SOMEBODY IS HOLDING IT. The
   * add-widget row appears at the HEAD of the column, so the moment the mode
   * opens it pushes every widget down about 60pt — under the finger that
   * opened it. On release that finger was over a different control, and the
   * picker opened instead of the drag finishing. It happened on the first test.
   */
  onDragChange?: (dragging: boolean) => void;
  onMove: (key: string, toIndex: number) => void;
  children: (key: string, index: number) => React.ReactNode;
  /** Vertical space between rows, so the arithmetic matches the layout. */
  gap?: number;
  /**
   * The scroll view this column lives in.
   *
   * ⚠️ WITHOUT IT NOTHING DRAGS AT ALL, and it fails silently: the ScrollView
   * claims the vertical gesture first, the pan never activates, and a widget
   * held and moved simply scrolls the page. No error, no warning — it just
   * does not work, which is the hardest kind of bug to look at.
   *
   * `blocksExternalGesture` makes the scroll view WAIT for this gesture to
   * decide. Scrolling still works, because the pan only claims the gesture
   * after a deliberate 10pt of vertical travel on a widget.
   */
  scrollRef?: React.RefObject<unknown>;
}

export function Arrangeable({ keys, arranging, onBeginArrange, onDragChange, onMove, children, gap = 13, scrollRef }: ArrangeableProps) {
  /*
    Heights live in a SHARED VALUE, not a ref, because the gesture reads them
    on the UI thread. A ref is invisible there — a worklet sees the value
    captured when it was created, so the first drag would use zeroes and every
    later one would use yesterday's numbers.
  */
  const heights = useSharedValue<number[]>([]);
  const measured = React.useRef<Record<string, number>>({});

  const onMeasure = React.useCallback((key: string, index: number) => (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0 || Math.abs((measured.current[key] ?? 0) - h) < 1) return;
    measured.current[key] = h;
    const next = keys.map((k) => measured.current[k] ?? 0);
    heights.value = next;
    void index;
  }, [keys, heights]);

  /** -1 when nothing is being dragged. */
  const dragging = useSharedValue(-1);
  /** The slot the dragged row would land in right now. */
  const hover = useSharedValue(-1);

  /*
    ⚠️ THE DRAG STATE IS CLEARED AFTER THE RE-ORDER IS DRAWN, NOT BEFORE.

    Clearing it inside the drop handler looked right and produced a visible
    double-jump: the shared values reset on the UI thread IMMEDIATELY, while
    React's re-render lands a frame or more later. For those frames the column
    is still drawn in the OLD order with every offset back at zero — so the two
    widgets that swapped snap to their old places, and then jump again when the
    new order arrives.

    `useLayoutEffect` keyed on the order runs after the commit and before the
    frame is drawn, so the clear and the new positions happen together and
    there is nothing in between to see.
  */
  const order = keys.join('|');
  React.useLayoutEffect(() => {
    dragging.value = -1;
    hover.value = -1;
    /*
      ⚠️ AND THE HEIGHTS ARE RE-ORDERED HERE TOO — THIS IS THE ONE THAT BIT.

      `heights` is an array BY POSITION, rebuilt only when a row REPORTS a new
      height. A reorder changes no height, so `onLayout` either does not fire
      or is dropped by the "same height" guard — and the table silently keeps
      describing the order before the swap.

      Everything downstream then reads a neighbour's measurement as its own:
      the swap threshold is computed from the wrong half-height, the neighbour
      parts by the wrong amount, and the dragged widget flies to a landing spot
      that is short by the difference between the two cards. The layout then
      corrects both on commit — which is precisely the "one jumps up, one jumps
      down, and then they settle" at the end of the SECOND drag onward.

      The first drag looks perfect, which is what made it hard to see.
    */
    heights.value = keys.map((k) => measured.current[k] ?? 0);
  }, [order, keys, dragging, hover, heights]);

  return (
    <View>
      {keys.map((key, index) => (
        <Row
          key={key}
          itemKey={key}
          index={index}
          count={keys.length}
          heights={heights}
          dragging={dragging}
          hover={hover}
          gap={gap}
          arranging={arranging}
          onBeginArrange={onBeginArrange}
          onDragChange={onDragChange}
          scrollRef={scrollRef}
          onMove={onMove}
          onMeasure={onMeasure(key, index)}
        >
          {children(key, index)}
        </Row>
      ))}
    </View>
  );
}

function Row({
  itemKey, index, count, heights, dragging, hover, gap, arranging, onBeginArrange, onDragChange, scrollRef, onMove, onMeasure, children,
}: {
  itemKey: string;
  index: number;
  count: number;
  heights: SharedValue<number[]>;
  dragging: SharedValue<number>;
  hover: SharedValue<number>;
  gap: number;
  arranging: boolean;
  onBeginArrange: () => void;
  onDragChange?: (dragging: boolean) => void;
  scrollRef?: React.RefObject<unknown>;
  onMove: (key: string, to: number) => void;
  onMeasure: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const y = useSharedValue(0);
  const lifted = useSharedValue(0);

  /*
    ⚠️ THE OFFSET IS CLEARED WHEN THIS ROW'S INDEX CHANGES, NOT ON DROP.

    After the reorder this row sits at a new index, and its natural position is
    exactly the one it has just flown to — so the offset must return to zero in
    the same frame the new order is drawn. Zeroing it in the drop handler
    instead put the row back where the DRAG STARTED for a frame, which is half
    of the jump-and-back.

    `useLayoutEffect` fires after the commit and before the frame is painted,
    so there is no frame in which the row is drawn at a new index with an old
    offset. It also fires on mount, where it is already zero.

    ⚠️ AND IT CLEARS `y` ONLY — NOT `lifted`. That is deliberate and it is the
    other half of the Android fix in the style below. `lifted` is what keeps the
    row's `zIndex` and `elevation` raised, and the whole point is that the raise
    must OUTLIVE this commit, so the row is not re-sorted among its siblings in
    the same frame the column changes order. Clearing it here — which this
    effect used to do — put it back exactly in that frame. Its spring is already
    running toward zero from `onEnd`; let it land on its own.
  */
  React.useLayoutEffect(() => {
    y.value = 0;
  }, [index, y]);

  const land = React.useCallback((to: number) => {
    onDragChange?.(false);
    if (to === index || to < 0) {
      /*
        Dropped where it started. Nothing re-renders, so nothing will clear
        this for us — settle it here.
      */
      y.value = 0;
      lifted.value = 0;
      dragging.value = -1;
      hover.value = -1;
      return;
    }
    /*
      Only the reorder. The offsets and the drag state are cleared by the
      layout effects above, in the frame the new order is drawn.
    */
    onMove(itemKey, to);
  }, [index, itemKey, onMove, onDragChange, y, lifted, dragging, hover]);

  const pan = React.useMemo(() => {
    const g = Gesture.Pan().maxPointers(1);

    /*
      ⚠️ THE SAME GESTURE, ACTIVATED TWO DIFFERENT WAYS.

      Reading  — a HOLD, and only a hold. No `activeOffset`, so no amount of
                 movement can ever pick a widget up by accident; the column
                 scrolls exactly as it did before this existed. The hold has to
                 be still, which is what tells a deliberate press apart from
                 the start of a flick.

      Arranging — 10pt of deliberate vertical travel, as before. Asking for a
                 second long press once the mode is already open would be
                 asking twice for the same permission.

      ⚠️ AND THE HOLD DOES NOT JUST OPEN THE MODE — IT BECOMES THE DRAG. The
      gesture activates, `onStart` turns arranging on, and `onUpdate` is already
      running: the finger that opened the mode is the finger that is moving the
      widget. That only works because the column is rendered through this
      component in both modes (see `arranging` above).
    */
    const chained = g
        .onStart(() => {
          'worklet';
          if (!arranging) runOnJS(onBeginArrange)();
          if (onDragChange) runOnJS(onDragChange)(true);
          dragging.value = index;
          hover.value = index;
          lifted.value = withSpring(1, { ...SPRING });
        })
        .onUpdate((e) => {
          'worklet';
          y.value = e.translationY;

          /*
            Which slot is the dragged row's CENTRE over?

            ⚠️ Centre, not top edge. Dragged by the top, a tall widget swaps
            places the moment its corner crosses a boundary — long before it
            looks like it should, and the taller it is the wronger it feels.
          */
          const h = heights.value;
          let top = 0;
          for (let n = 0; n < index; n++) top += (h[n] ?? 0) + gap;
          const centre = top + e.translationY + (h[index] ?? 0) / 2;

          let to = 0;
          let cursor = 0;
          for (let n = 0; n < count; n++) {
            const mid = cursor + (h[n] ?? 0) / 2;
            if (n !== index && centre > mid) to++;
            cursor += (h[n] ?? 0) + gap;
          }
          hover.value = to;
        })
        .onEnd(() => {
          'worklet';
          /*
            ⚠️ IT FLIES INTO THE GAP, IT DOES NOT SNAP BACK.

            The first cut set `y` to 0 on release: the widget teleported to
            where the drag STARTED, and the re-render then put it in its new
            slot — two jumps at the moment the gesture should feel resolved.

            So: work out where the row will sit once the list is reordered,
            animate to exactly that offset, and commit only on arrival. The
            neighbours hold their parted positions throughout, because
            `dragging` stays set until then — the gap is still open when the
            widget lands in it.
          */
          const h = heights.value;
          const to = hover.value;

          let oldTop = 0;
          for (let n = 0; n < index; n++) oldTop += (h[n] ?? 0) + gap;

          /* Where it lands: after the first `to` of the OTHER rows. */
          let newTop = 0;
          let placed = 0;
          for (let n = 0; n < count && placed < to; n++) {
            if (n === index) continue;
            newTop += (h[n] ?? 0) + gap;
            placed++;
          }

          lifted.value = withSpring(0, { ...SPRING });
          y.value = withTiming(newTop - oldTop, { ...FLIGHT }, (finished) => {
            /*
              Only when it has actually arrived. An interrupted spring — a
              second drag begun before this one settled — must not commit a
              reorder the finger has already moved past.
            */
            if (finished) runOnJS(land)(to);
          });
        })
        .onTouchesCancelled(() => {
          'worklet';
          if (onDragChange) runOnJS(onDragChange)(false);
          /* Nothing to commit, so put it back where it came from. */
          y.value = withSpring(0, { ...SPRING });
          lifted.value = withSpring(0, { ...SPRING });
          dragging.value = -1;
          hover.value = -1;
        });
    /*
      ⚠️ THE SCROLL VIEW ONLY WAITS WHILE ARRANGING.

      `blocksExternalGesture` makes the scroll view hold still until this
      gesture has decided, which is what a drag needs — see `scrollRef`. But
      applying it while READING would put that decision in front of every
      scroll on the home screen, and the whole column would feel a beat late to
      start moving. It is not needed there: a hold does not scroll, so the two
      gestures are not competing for anything.
    */
    /*
      ⚠️ THE ACTIVATION IS APPLIED TO THE END OF THE CHAIN, AND THE CHAIN IS
      NEVER BROKEN.

      This was written as three statements — `const g = Gesture.Pan()`, then
      `if (arranging) g.activeOffsetY(...)`, then `g.onStart(...)` — which
      reads the same and is not. Reanimated's Babel plugin workletizes gesture
      callbacks by RECOGNISING the builder chain; split across statements it no
      longer recognises it, silently stops, and the whole drag runs on the JS
      thread. The only sign was one line in logcat:

        [react-native-gesture-handler] None of the callbacks in the gesture
        are worklets.

      One expression, and an explicit `'worklet'` in every callback so it never
      depends on the plugin recognising anything again.
    */
    const configured = arranging
      ? chained.activeOffsetY([-10, 10])
      : chained.activateAfterLongPress(HOLD);

    return arranging && scrollRef
      ? configured.blocksExternalGesture(scrollRef as never)
      : configured;
  }, [arranging, onBeginArrange, onDragChange, land, y, lifted, dragging, hover, heights, index, count, gap, scrollRef]);

  const style = useAnimatedStyle(() => {
    const d = dragging.value;

    /*
      ⚠️ THE LIFT OUTLIVES THE DRAG, AND IT IS A STEP, NOT A RAMP.

      Both halves of that sentence are about ANDROID, and both are free on
      iOS — which is why the drop felt clean on an iPhone and hitched on a
      phone for the same code.

      `elevation` is the Android-only half of a shadow, and it is not just
      paint: it feeds the sibling DRAW ORDER. It used to be
      `lifted.value * 12`, so every frame of the gesture asked Android to
      recompute the view's outline, its shadow, and where it sits among its
      siblings — sixty times a second, for an effect with two states. It is a
      step now. iOS never saw this: `elevation` is ignored there and the
      `shadow*` props above do the work.

      The second half is `raised`, which is driven by `lifted` rather than by
      `dragging`. `dragging` is cleared in the same commit that REORDERS the
      column, so the old code dropped `zIndex` 20 → 0 and `elevation` 12 → 0 in
      the exact frame the children changed places. React Native implements
      `zIndex` on Android by re-sorting the ViewGroup's children, so that one
      frame carried three separate reasons to re-sort — and the drop flickered.
      `lifted` is still finishing its spring then, so the row stays raised
      through the reorder and comes down once, a moment later, when nothing
      else is moving.
    */
    const raised = lifted.value > 0.01;

    // The row under the finger — and, after release, the row still settling.
    if (d === index || (d === -1 && raised)) {
      return {
        transform: [{ translateY: y.value }, { scale: 1 + lifted.value * 0.03 }],
        zIndex: 20,
        shadowColor: '#000',
        shadowOpacity: lifted.value * 0.45,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
      };
    }

    /*
      ⚠️ NOTHING IS DRAGGING: THE OFFSET IS PLAIN ZERO, NOT AN ANIMATION TO IT.

      This is the whole of the second flicker, and it is subtle. A parted row
      is sitting at, say, -105. When the reorder commits, the LAYOUT already
      moves it up a slot — it is where it belongs. If the offset then springs
      from -105 to 0, it animates 105pt DOWNWARD from a position that was
      already correct: it appears to jump up and slide back. Two rows doing
      that at once, in opposite directions, is exactly "one up and one down and
      then set".

      Animate the parting; never animate the un-parting. By the time the
      offset is no longer needed, the layout has already taken it over.
    */
    if (d === -1) {
      return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0, shadowOpacity: 0, elevation: 0 };
    }

    /*
      ⚠️ EVERYTHING ELSE PARTS TO MAKE THE GAP.

      A row shifts by exactly the DRAGGED row's height when that row is passing
      through its slot — up if it came from above, down if from below. Using
      the dragged row's height rather than its own is what keeps the gap the
      right size for a tall shift card and for a one-line documents row alike.
    */
    const h = (heights.value[d] ?? 0) + gap;
    let shift = 0;
    if (d < index && hover.value >= index) shift = -h;
    else if (d > index && hover.value <= index) shift = h;

    return {
      transform: [{ translateY: withSpring(shift, { ...SPRING }) }, { scale: 1 }],
      zIndex: 0,
      shadowOpacity: 0,
      elevation: 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={onMeasure}
        /*
          ⚠️ ANDROID-ONLY, AND IT IS ABOUT THE ROW EXISTING AT ALL.

          `collapsable` is React Native's Android optimisation: a View that has
          no visual effect of its own is removed from the NATIVE hierarchy
          entirely and its children are re-parented. A row that is picked up
          gains a transform and a shadow, so it stops qualifying — and the way
          a view stops being collapsed is by being DESTROYED and RECREATED in
          the native tree, which on screen is the row blinking out and back.

          The scroll content opts its children in (`collapsableChildren` in
          RN's own ScrollView), so this has to be said here. It is a no-op on
          iOS, which has no such mechanism — which is consistent with the drag
          looking clean there and flashing on Android.
        */
        collapsable={false}
        style={[{ marginBottom: gap }, style]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
