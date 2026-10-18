import type { ComponentProps } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/theme-context';
import { AText } from './text';
import { GhostButton } from './button';

/**
 * "Nothing here" — one outline icon, one sentence, and at most one way on.
 *
 * Screens each drew their own (a 48 or a 40 icon, secondary or muted grey, a
 * bespoke back button); one look now, in the theme's own colours.
 * `fill` centres it in the whole screen; without it, it sits in a list.
 */
export function EmptyState({
  icon,
  text,
  action,
  fill = false,
  style,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  text: string;
  action?: { label: string; onPress: () => void };
  fill?: boolean;
  style?: ViewStyle;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View
      style={[
        {
          alignItems: 'center',
          gap: amazen.space(3),
          paddingVertical: amazen.space(10),
          paddingHorizontal: amazen.space(5),
        },
        fill ? { flex: 1, justifyContent: 'center' } : null,
        style,
      ]}
    >
      <Ionicons name={icon} size={40} color={c.inkMuted} />
      <AText variant="body" tone="muted" style={{ textAlign: 'center' }}>
        {text}
      </AText>
      {action ? <GhostButton label={action.label} onPress={action.onPress} tone="accent" /> : null}
    </View>
  );
}
