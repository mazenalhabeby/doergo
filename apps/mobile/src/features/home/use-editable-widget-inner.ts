import React from 'react';
import { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { widgetTitle, type WidgetRow } from './registry';

/** Edit mode's resting scale. §3. */
export const REST = 0.965;

/** EditableWidgetInner's state and handlers — everything before its markup, moved here unchanged. */
export function useEditableWidgetInner({
  row,
  editing,
  isActive,
  drag,
  onEnterEdit,
  onRemove,
  onMove,
  canUp,
  canDown,
  screenReader,
  landed,
}: Pick<{
  row: WidgetRow;
  editing: boolean;
  /** This is the card under the finger right now. */
  isActive: boolean;
  /** `renderItem` gave us this — calling it starts the drag. */
  drag: () => void;
  /*
    ⚠️ EVERY CALLBACK TAKES THE KEY, so the parent can pass ONE stable function
    per action instead of a fresh closure per row per render. `renderItem` runs
    for every card on every parent state change — entering edit mode, a landed
    ring expiring, a drag starting — and a new `() => remove(item.key)` on each
    of them defeats `React.memo` on a component that renders a whole live
    widget underneath it.
  */
  onEnterEdit: () => void;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: 'up' | 'down') => void;
  canUp: boolean;
  canDown: boolean;
  screenReader: boolean;
  /** Just added from the gallery — wears a jade ring for 30 seconds. */
  landed: boolean;
}, 'row' | 'editing' | 'isActive' | 'drag' | 'onEnterEdit' | 'onRemove' | 'onMove' | 'canUp' | 'canDown' | 'screenReader' | 'landed'>) {
  const { amazen, isDark } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const title = widgetTitle(row, t);

  /*
    ⚠️ A TRANSFORM, NEVER A LAYOUT ANIMATION. `scale` moves pixels and touches
    no layout, so the column's geometry is identical in both modes and the
    drag's own measurements stay true. A layout animation here would take the
    card out of layout mid-flight, which is the bug that once left the whole
    home column stacked on itself until the app was reloaded.
  */
  const shrink = useSharedValue(editing ? REST : 1);
  React.useEffect(() => {
    shrink.value = withTiming(editing ? REST : 1, {
      duration: amazen.motion.state,
      easing: Easing.bezier(...amazen.motion.easing),
      /* Reduce Motion: the mode still opens, it simply arrives. */
      reduceMotion: ReduceMotion.System,
    });
  }, [editing, shrink, amazen.motion.state, amazen.motion.easing]);

  const shrinkStyle = useAnimatedStyle(() => ({ transform: [{ scale: shrink.value }] }));

  /*
    THE LIFT'S HALO — `0 0 0 4px rgba(jade,.12)`.

    ⚠️ ABSOLUTELY POSITIONED, OUTSIDE THE FLOW. A 4pt padding would change the
    cell's measured size the moment the drag began, and the library measures
    cells to decide where the slot goes — so the halo would move the card it is
    drawn around.

    ⚠️ IT IS ALSO WHERE THE `glass` SURFACE LANDS. Each widget draws its own
    Well or GlassCard inside itself, so a lifted card cannot have its surface
    swapped from out here without rewriting all five. The rim is glass and
    carries the glass shadow, which is what "lifted, floating" actually reads
    as — and it does it without a widget having to know it is being dragged.
  */
  /*
    ⚠️ A PLAIN STYLE, NOT A WORKLET. `isActive` is an ordinary React prop, so
    `useAnimatedStyle` here returned a constant and bought a worklet per card
    for nothing. The lift is instant on both platforms anyway — it is the
    moment the card leaves the column, and a fade would make it look uncertain.
  */
  const halo = { opacity: isActive ? 1 : 0 };

  /*
    ⚠️ ENTERING IS AN RNGH GESTURE; DRAGGING IS AN RN PRESSABLE.

    Two different jobs with two different competitors. Entering has to beat the
    widget's OWN buttons — a card wrapped in a Pressable that opens a screen
    takes the touch before any parent sees it, which is why a plain
    `onLongPress` on the wrapper never fired on half the column. An RNGH
    LongPress is recognised natively and wins that.

    Dragging must NOT beat anything: the list's own Pan is an ancestor, and a
    gesture of ours activating in the same touch would cancel it, so the card
    would be "picked up" and then never follow the finger. `drag()` only needs
    to be called while that Pan is already tracking the touch — which is
    exactly what a plain Pressable does, and is what the library's own examples
    use.
  */
  const enter = React.useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(500)
        .maxDistance(12)
        .enabled(!editing)
        .onStart(() => {
          'worklet';
          runOnJS(onEnterEdit)();
        }),
    [editing, onEnterEdit],
  );

  return {
    amazen,
    isDark,
    t,
    c,
    title,
    shrinkStyle,
    halo,
    enter,
  };
}
