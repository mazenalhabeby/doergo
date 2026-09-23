import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { useTheme } from '../../contexts/theme-context';
import { AText } from './text';
import { Chip } from './button';

/**
 * A widget's header, and the boundary that keeps it from taking the screen
 * down with it.
 *
 * ⚠️ EACH WIDGET FAILS ALONE. `offline/tasks/list-failure.ts` is the model and
 * three of its four branches are non-fatal: a refusal is fatal, an unreachable
 * network with something already on screen is not, and a cold start that has
 * not opened the phone's database yet is not — declaring somebody offline a
 * few hundred milliseconds before their own data arrives is how a phone with
 * full signal shows an error a Retry button then clears.
 *
 * ⚠️ AN EMPTY STATE IS A DECISION, NOT AN ABSENCE. Every widget says which of
 * the three it is, in its own registry row or its own component:
 *
 *   hidden      — normal, nothing to report (documents, next job)
 *   invitation  — there is something here but it has not been set up
 *                 (stops with no plan → "Plan the route")
 *   all-clear   — the answer is genuinely "nothing, and that is good"
 *                 (a calm crew)
 */
export class WidgetBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* the widget is out; the screen is not */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function WidgetHeader({
  title,
  count,
  action,
  onPress,
  tone = 'onGradient',
  style,
}: {
  title: string;
  /** A count belongs IN the header, not as a badge floating beside it. */
  count?: number;
  /** The word on the right — "See all". Only with `onPress`. */
  action?: string;
  onPress?: () => void;
  tone?: 'onGradient' | 'strong';
  style?: ViewStyle;
}) {
  const { amazen } = useTheme();
  const body = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: amazen.space(2),
          paddingHorizontal: amazen.space(1),
          marginBottom: amazen.space(2.5),
          minHeight: 28,
        },
        style,
      ]}
    >
      <AText variant="h3" tone={tone}>{title}</AText>
      {typeof count === 'number' && count > 0 ? <Chip label={String(count)} numeric /> : null}
      <View style={{ flex: 1 }} />
      {action && onPress ? <AText variant="caption" tone="accent">{action}</AText> : null}
    </View>
  );
  if (!action || !onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title} — ${action}`}>
      {body}
    </Pressable>
  );
}

/**
 * One block in the home column. `layout.block` (13) between blocks — set here
 * once so a widget never sets its own outer margin and the column cannot go
 * ragged.
 */
export function WidgetFrame({
  children,
  header,
  fallback = null,
  /** Position in the column — the entrance is staggered by it. */
  index = 0,
  style,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  /** What renders instead if this widget throws. `null` = it disappears. */
  fallback?: React.ReactNode;
  index?: number;
  style?: ViewStyle;
}) {
  const { amazen } = useTheme();
  return (
    <Animated.View
      /*
        The column arrives, top first.
        
        ⚠️ 45ms apart and CAPPED at four. A stagger is a hand dealing cards; an
        uncapped one is a queue, and the eighth widget would land two thirds of
        a second after the first on a screen somebody opens forty times a day.
        Past the fourth they all arrive together.

        ⚠️ `entering` and NOT an opacity the widget starts at. A widget parked
        at 0 waiting for an effect is a blank home screen for anybody whose
        animation never runs — a JS thread stall, a reduced-motion setting read
        wrong. Reanimated's entering always resolves, and `ReduceMotion.System`
        makes it instant rather than absent when the phone has asked for that.

        The distance is 8pt. Enough to read as arriving from somewhere, not so
        much that the screen looks like it is being assembled.
      */
      entering={FadeInDown.duration(amazen.motion.enter)
        .delay(Math.min(index, 4) * 45)
        .easing(Easing.bezier(...amazen.motion.easing).factory())
        .reduceMotion(ReduceMotion.System)}
      style={[{ marginBottom: amazen.layout.block }, style]}
    >
      <WidgetBoundary fallback={fallback}>
        {header}
        {children}
      </WidgetBoundary>
    </Animated.View>
  );
}
