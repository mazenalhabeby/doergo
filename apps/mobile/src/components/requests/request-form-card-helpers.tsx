import { Pressable } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';

/** RequestFormCard's module-level helpers, moved here unchanged so its sections can read them too. */
export function Stepper({ sign, label, onPress }: { sign: string; label: string; onPress: () => void }) {
  const { amazen } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: amazen.color.tile,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <AText variant="h2" tone="strong">{sign}</AText>
    </Pressable>
  );
}
