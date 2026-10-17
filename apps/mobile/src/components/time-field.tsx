import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';

/** Split a wall-clock "yyyy-MM-ddTHH:mm" into the two things a phone edits. */
export function splitWall(wall: string): { date: string; time: string } {
  const [date = '', time = ''] = wall.split('T');
  return { date, time };
}

export const joinWall = (date: string, time: string) => (date && time ? `${date}T${time}` : '');

/** "yyyy-MM-dd" ↔ Date, for the calendar. Local-only: it is a calendar day. */
export function dateFromISO(d: string): Date | null {
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day);
}

/** HH:MM, 24-hour — the format the field accepts however the app displays time. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One clock: a day picked from a calendar, a time typed as HH:MM.
 *
 * Declared at module scope, NOT inside the sheet. A component defined during
 * render is a new type every render, so React unmounts and remounts it — the
 * time field would lose focus and the keyboard would close after every single
 * digit, which is unusable and looks like the app dropping input.
 */
export function TimeField({
  label,
  date,
  time,
  onTime,
  onPick,
  colors,
  placeholder,
  hint,
}: {
  label: string;
  date: string;
  time: string;
  onTime: (v: string) => void;
  onPick: () => void;
  colors: { surface: string; border: string; textPrimary: string; textMuted: string; textSecondary: string };
  placeholder: string;
  hint: string;
}) {
  const bad = !!time && !TIME_RE.test(time);
  return (
    <View style={s.field}>
      <Text style={[s.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={s.fieldRow}>
        <TouchableOpacity
          style={[s.control, s.dateControl, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={onPick}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
          <Text style={[s.controlText, { color: date ? colors.textPrimary : colors.textMuted }]}>
            {date || placeholder}
          </Text>
        </TouchableOpacity>
        <TextInput
          style={[
            s.control,
            s.timeControl,
            { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: bad ? COLORS.error : colors.border },
          ]}
          value={time}
          onChangeText={onTime}
          placeholder="HH:MM"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
      </View>
      {!!date && !time && <Text style={[s.hint, { color: colors.textMuted }]}>{hint}</Text>}
    </View>
  );
}

export const s = StyleSheet.create({
  zone: { fontSize: FONT_SIZE.xs, marginBottom: SPACING.md },
  field: { marginBottom: SPACING.md },
  label: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.xs },
  fieldRow: { flexDirection: 'row', gap: SPACING.sm },
  control: {
    height: 44, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md, fontSize: FONT_SIZE.base,
  },
  dateControl: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  controlText: { fontSize: FONT_SIZE.base },
  timeControl: { width: 96, textAlign: 'center' },
  area: {
    minHeight: 70, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md, fontSize: FONT_SIZE.base, textAlignVertical: 'top',
  },
  hint: { fontSize: FONT_SIZE.xs, marginTop: SPACING.xs },
  error: { fontSize: FONT_SIZE.sm, marginBottom: SPACING.md },
  saveBtn: { paddingVertical: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACING.sm },
  saveText: { color: '#fff', fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
});
