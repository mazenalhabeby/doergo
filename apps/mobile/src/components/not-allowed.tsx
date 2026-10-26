import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/amazen/ink-icon';
import { useTheme } from '../contexts/theme-context';
import { FONT_SIZE, SPACING } from '../lib/constants';

/**
 * "You may not do this here" — a lock and one sentence, centred in the screen.
 * The look scan-card and asset-expense each wrote out (unchanged); asset-log's
 * smaller caption is a variant, listed in docs/design/ui-pieces/variants-phone.md.
 */
export function NotAllowed({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View style={s.centre}>
      <Icon name="lock" size={40} color={colors.textMuted} />
      <Text style={[s.hint, { color: colors.textMuted }]}>{message}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  hint: { fontSize: FONT_SIZE.sm, textAlign: 'center' },
});
