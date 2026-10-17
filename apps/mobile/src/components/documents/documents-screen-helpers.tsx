import { View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { toneColor } from '../../theme/tone-color';

/** DocumentsScreen's module-level helpers, moved here unchanged so its sections can read them too. */
export function Fact({
  label,
  value,
  first,
  tone,
}: {
  label: string;
  value: string;
  first?: boolean;
  tone?: 'accent' | 'warn' | 'critical' | 'neutral';
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const color = toneColor(c, tone, c.inkStrong);
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: amazen.space(2.75),
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.lineWell,
      }}>
      <AText variant="body" tone="muted" style={{ fontSize: 13.5 }}>{label}</AText>
      <AText variant="body" style={{ fontSize: 13.5, color, flexShrink: 1, textAlign: 'right' }}>{value}</AText>
    </View>
  );
}
