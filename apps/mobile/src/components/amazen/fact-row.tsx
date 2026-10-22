import { Pressable, View } from 'react-native';
import { useTheme } from '@/contexts/theme-context';
import { AText } from './text';
import { toneColor } from '@/theme/tone-color';

/**
 * The one label → value row: label left in muted ink, value right, a hairline
 * between rows (`first` drops the one above the first row). One frame for
 * documents, equipment, a client's facts, a member's details and an event —
 * they used to draw five slightly different rows for the same idea.
 *
 * - `numeric`: tabular digits for a reading, an amount or a date.
 * - `onPress`: the whole row is a button and the value ends with `›`.
 * - `action`: a small text button after the value (e.g. "Call") — the row itself stays still.
 * - `muted`: the value is a placeholder ("Not set"), not a fact.
 * - `selectable`: the value can be copied (addresses, numbers).
 */
export function FactRow({
  label,
  value,
  first,
  tone,
  numeric,
  onPress,
  action,
  muted,
  selectable,
}: {
  label: string;
  value: string;
  first?: boolean;
  tone?: 'accent' | 'warn' | 'critical' | 'neutral';
  numeric?: boolean;
  onPress?: () => void;
  action?: { label: string; onPress: () => void };
  muted?: boolean;
  selectable?: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const color = muted ? c.inkMuted : toneColor(c, tone, c.inkStrong);
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: amazen.space(3),
        paddingVertical: amazen.space(2.75),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.lineWell,
      }}
    >
      <AText variant="body" tone="muted" style={{ fontSize: 13.5, flexShrink: 1 }}>
        {label}
      </AText>
      <AText
        variant="body"
        numeric={numeric}
        selectable={selectable}
        style={{ fontSize: 13.5, color, flexShrink: 1, textAlign: 'right' }}
      >
        {onPress ? `${value}  ›` : value}
      </AText>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button">
          <AText variant="caption" style={{ color: c.accent, fontSize: 13 }}>
            {action.label}
          </AText>
        </Pressable>
      ) : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    body
  );
}
