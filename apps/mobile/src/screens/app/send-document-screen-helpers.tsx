import { View, Text, StyleSheet, TextInput } from 'react-native';
import { SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../lib/constants';

/** SendDocumentScreen's module-level helpers, moved here unchanged so its sections can read them too. */
export function Field({
  colors, label, value, onChange,
}: { colors: any; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={[s.field, { borderColor: colors.border }]}>
      <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        style={[s.input, { color: colors.textPrimary }]}
      />
    </View>
  );
}

export const s = StyleSheet.create({
  safe: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  verdict: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  verdictTitle: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold as any },
  verdictSub: { fontSize: FONT_SIZE.xs, marginTop: 3, lineHeight: 17 },

  label: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: SPACING.sm },
  field: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  fieldLabel: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: { fontSize: FONT_SIZE.base, paddingVertical: 6 },
  warn: { color: '#f59e0b', fontSize: FONT_SIZE.xs, marginTop: SPACING.sm },

});
