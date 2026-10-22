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
import { AText, WidgetBoundary } from '../../components/amazen';
import { shadowGlass, shadowUnderGlass } from '../../components/amazen/surfaces';
import { widgetTitle, type WidgetRow } from './registry';
import { useEditableWidgetInner, REST } from './use-editable-widget-inner';
import { RemoveBadge, Arrows } from './editable-widget-inner-helpers';

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
/**
 * The lift is 1.02 ABSOLUTE, and `ScaleDecorator` multiplies whatever this
 * card is already at — so the factor it needs is 1.02 ÷ 0.965.
 *
 * ⚠️ Passing 1.02 straight through would lift to 0.984 and read as the card
 * getting SMALLER when you pick it up.
 */
export const LIFT_FACTOR = 1.02 / REST;

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
  const {
    amazen,
    isDark,
    t,
    c,
    title,
    shrinkStyle,
    halo,
    enter,
  } = useEditableWidgetInner({ row, editing, isActive, drag, onEnterEdit, onRemove, onMove, canUp, canDown, screenReader, landed });

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
          // The halo is a translucent tint — no elevation under it on Android.
          shadowUnderGlass(isDark),
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
