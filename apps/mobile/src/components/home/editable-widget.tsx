import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText, WidgetBoundary } from '../amazen';
import { shadowGlass } from '../amazen/surfaces';
import { widgetTitle, type WidgetRow } from '../../home/registry';

/**
 * ONE CARD, IN BOTH MODES — AND THEY ARE THE SAME CARD.
 *
 * ⚠️ EDITING HAPPENS ON THE HOME SCREEN, ON THE THING BEING EDITED. There is
 * no arrange screen and no list of widget names, because a list asks somebody
 * to imagine the result: "is Crew above My work?" is a question about a picture,
 * and the picture is right here. Both phones settled on this years ago — you
 * press and hold what you are looking at, and it starts to move.
 *
 * ⚠️ AND ENTERING THE MODE MOVES NOTHING. The card shrinks 3.5% in place and
 * grows a ⊖; the column does not reflow, nothing is inserted, nothing shifts
 * under the finger that just opened the mode. That rule was learned the
 * expensive way here — a dashed "Add a widget" row at the head of the column
 * was worth about 60pt and shoved every widget down the instant the hold
 * registered, which is what made a dragged card land a slot from where it was
 * aimed. The ＋ lives in the header, outside the scroll view, for that reason.
 */

/** How long the arrival ring stays on a widget added from the gallery. */
export const LANDED_MS = 30_000;

/** Edit mode's resting scale. §3. */
const REST = 0.965;
/**
 * The lift is 1.02 ABSOLUTE, and `ScaleDecorator` multiplies whatever this
 * card is already at — so the factor it needs is 1.02 ÷ 0.965.
 *
 * ⚠️ Passing 1.02 straight through would lift to 0.984 and read as the card
 * getting SMALLER when you pick it up.
 */
export const LIFT_FACTOR = 1.02 / REST;

/**
 * The neutral ⊖.
 *
 * ⚠️ NEVER RED, AND THIS IS NOT A STYLE NOTE. Removing a widget deletes
 * nothing — the key stays in storage, hidden, and switching it back on returns
 * it to the position it was arranged into. A red badge states a destructive
 * act, so the member either hesitates over a reversible one or learns that red
 * in this app does not mean what it means everywhere else. Both are worse than
 * a grey mark.
 *
 * `raised` surface → `barFill`, the kit's one solid neutral that is made to sit
 * over the gradient. `ink2` stroke → `ink`.
 */
function RemoveBadge({ label, onPress }: { label: string; onPress: () => void }) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={({ pressed }) => [
        {
          position: 'absolute',
          top: -9,
          left: -9,
          width: 26,
          height: 26,
          borderRadius: amazen.radius.full,
          backgroundColor: c.barFill,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.lineWell,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        },
        shadowGlass(isDark),
      ]}
    >
      {/* The bar of a ⊖, drawn rather than typed: the character's width and
          optical centre differ on every platform font. */}
      <View style={{ width: 11, height: 1.8, borderRadius: 1, backgroundColor: c.ink }} />
    </Pressable>
  );
}

/**
 * The up/down arrows — ⚠️ ON SCREEN ONLY WHEN A SCREEN READER IS RUNNING.
 *
 * WCAG 2.5.7 is satisfied by the `accessibilityActions` every card carries,
 * which VoiceOver and TalkBack surface through the rotor and reading controls
 * without anything being drawn. Drawing them for everybody would put two extra
 * controls on every card for something neither platform shows — but a member
 * who is exploring by touch benefits from them being real, hittable targets as
 * well as rotor entries.
 */
function Arrows({
  up, down, onUp, onDown, labelUp, labelDown,
}: {
  up: boolean; down: boolean;
  onUp: () => void; onDown: () => void;
  labelUp: string; labelDown: string;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const btn = (on: boolean, press: () => void, label: string, mark: string) => (
    <Pressable
      onPress={on ? press : undefined}
      disabled={!on}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !on }}
      hitSlop={8}
      style={{
        width: 32, height: 32,
        borderRadius: amazen.radius.full,
        backgroundColor: c.barFill,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: c.lineWell,
        alignItems: 'center',
        justifyContent: 'center',
        /* ⚠️ Dimmed, never removed — a control that disappears makes the row
           jump under the finger that was about to press the other one. */
        opacity: on ? 1 : 0.35,
      }}
    >
      <AText variant="body" tone="ink" style={{ lineHeight: 20 }}>{mark}</AText>
    </Pressable>
  );
  return (
    <View style={{ position: 'absolute', top: -9, right: -4, flexDirection: 'row', gap: 6 }}>
      {btn(up, onUp, labelUp, '↑')}
      {btn(down, onDown, labelDown, '↓')}
    </View>
  );
}

function EditableWidgetInner({
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
}: {
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
}) {
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

  return (
    <Animated.View
      style={[{ marginBottom: amazen.layout.block }, shrinkStyle]}
      /*
        ⚠️ ONE OBJECT WHILE EDITING, AND THE WIDGET'S OWN TREE OTHERWISE.
        `accessible` collapses everything inside into a single node — right for
        a card you are moving, wrong for a card you are reading, where every
        row inside it is its own thing.
      */
      accessible={editing}
      accessibilityLabel={editing ? title : undefined}
      accessibilityActions={
        editing
          ? [
              { name: 'moveUp', label: t('home.edit.moveUp', { defaultValue: 'Move up' }) },
              { name: 'moveDown', label: t('home.edit.moveDown', { defaultValue: 'Move down' }) },
              { name: 'remove', label: t('home.edit.remove', { defaultValue: 'Take off my home' }) },
            ]
          : undefined
      }
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'moveUp') onMove(row.key, 'up');
        else if (e.nativeEvent.actionName === 'moveDown') onMove(row.key, 'down');
        else if (e.nativeEvent.actionName === 'remove') onRemove(row.key);
      }}
    >
      {/* the lift's glass rim + jade halo */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: -4, left: -4, right: -4, bottom: -4,
            borderRadius: amazen.radius.surface + 4,
            backgroundColor: c.accentTint,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: c.lineGlass,
          },
          shadowGlass(isDark),
          halo,
        ]}
      />

      {/* the arrival ring — 30 seconds, then gone */}
      {landed ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -3, left: -3, right: -3, bottom: -3,
            borderRadius: amazen.radius.surface + 3,
            borderWidth: 2,
            borderColor: c.accent,
          }}
        />
      ) : null}

      <GestureDetector gesture={enter}>
        <View>
          {/*
            ⚠️ WHILE EDITING THE WIDGET IS NOT BEING USED. A live card here
            takes a tap meant for ⊖ and navigates away from the screen the
            member is in the middle of arranging — which is what both phones
            prevent by making an icon inert in jiggle mode.
          */}
          {/* ⚠️ EACH WIDGET FAILS ALONE — one that cannot load takes itself
              off the screen and never the card beside it. */}
          <View pointerEvents={editing ? 'none' : 'auto'}>
            <WidgetBoundary fallback={null}>
              <row.Component />
            </WidgetBoundary>
          </View>

          {editing ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              /* Already in the mode — a long hold to start moving, not a
                 second 500ms wait. */
              delayLongPress={200}
              onLongPress={drag}
              /* ⚠️ A TAP ON A CARD DOES NOTHING, and absorbing it is the
                 point: "a tap anywhere that is NOT a card" leaves the mode. */
              onPress={() => {}}
              accessible={false}
            />
          ) : null}
        </View>
      </GestureDetector>

      {editing ? (
        <RemoveBadge
          label={`${t('home.edit.remove', { defaultValue: 'Take off my home' })} — ${title}`}
          onPress={() => onRemove(row.key)}
        />
      ) : null}

      {editing && screenReader ? (
        <Arrows
          up={canUp}
          down={canDown}
          onUp={() => onMove(row.key, 'up')}
          onDown={() => onMove(row.key, 'down')}
          labelUp={`${t('home.edit.moveUp', { defaultValue: 'Move up' })} — ${title}`}
          labelDown={`${t('home.edit.moveDown', { defaultValue: 'Move down' })} — ${title}`}
        />
      ) : null}
    </Animated.View>
  );
}

/**
 * THE GAP THE CARD CAME OUT OF — a dashed jade slot, `1.5px dashed` at 45%.
 *
 * ⚠️ IT IS NOT DECORATION, IT IS THE ANSWER TO "WHERE WILL THIS LAND". The
 * card being dragged is under a thumb; the slot is the only thing on screen
 * saying where letting go will put it, which is why it tracks the drop index
 * rather than the finger.
 *
 * `renderPlaceholder` is drawn into an absolutely-filled view sized to the
 * card that was picked up, so this fills its parent and needs no height of
 * its own.
 */
export function DropSlot() {
  const { amazen } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0, right: 0, top: 0,
        bottom: amazen.layout.block,
        borderRadius: amazen.radius.surface,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: amazen.color.accent,
        opacity: 0.45,
      }}
    />
  );
}


/**
 * ⚠️ MEMOIZED, AND THAT IS NOT A MICRO-OPTIMISATION HERE.
 *
 * Each of these renders a whole live widget — its own hooks, its own data, its
 * own subtree. `renderItem` runs for every card whenever the screen's state
 * moves, which it does on entering and leaving edit mode, on every landed ring
 * expiring, and on every drag. Without this, picking one card up re-renders
 * every widget on the home.
 *
 * It only works because every callback above takes the key: a fresh closure
 * per row would change the props on every render and this would skip nothing.
 */
export const EditableWidget = React.memo(EditableWidgetInner);
