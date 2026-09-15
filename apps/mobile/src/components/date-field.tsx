import { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../lib/constants';
import { formatDateOf } from '../lib/utils';
import { dateFromDayKey, dayKeyOf } from '../lib/log-dates';
import { DatePickerModal } from './date-picker-modal';

/**
 * A calendar DAY as a form field: a box that reads "14 Sept 2026" and
 * opens the calendar.
 *
 * ⚠️ JS-only on purpose, like `DatePickerModal` and `TimePickerModal`: the
 * native `@react-native-community/datetimepicker` would need a store build
 * before anybody could use it, and this app ships JavaScript between builds.
 *
 * The value is a "YYYY-MM-DD" string, not a `Date` — what the logbook stores
 * for a date field and what a sticker says. A day has no time zone, and a
 * `Date` here would carry one in from the phone and hand it to whoever reads
 * the value next.
 *
 * Replaces typing "YYYY-MM-DD" into a text box: nobody types an ISO date at a
 * pump, and "14.09.2026" typed the way everybody here writes it was refused.
 */
export function DateField({
  value,
  onChange,
  minDate,
  maxDate,
  clearable = false,
  placeholder,
  title,
  invalid = false,
}: {
  /** "YYYY-MM-DD", or "" for no date. */
  value: string;
  onChange: (dayKey: string) => void;
  minDate?: Date;
  maxDate?: Date;
  /** Offer "Clear" — for an optional date only. */
  clearable?: boolean;
  placeholder?: string;
  title?: string;
  /** Draw the border as an error — the problem itself is said by the form. */
  invalid?: boolean;
}) {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = dateFromDayKey(value);

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={[s.box, { borderColor: invalid ? COLORS.error : colors.border }]}
      >
        <Ionicons name="calendar-outline" size={18} color={selected ? COLORS.primary : colors.textMuted} />
        <Text style={[s.text, { color: selected ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>
          {selected
            ? formatDateOf(selected, i18n.language, undefined, true)
            : placeholder ?? t('components.datePicker.selectDate')}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <DatePickerModal
        visible={open}
        selectedDate={selected}
        onSelect={(d) => onChange(dayKeyOf(d))}
        onClear={clearable ? () => onChange('') : undefined}
        onClose={() => setOpen(false)}
        minDate={minDate}
        maxDate={maxDate}
        title={title}
      />
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  text: { flex: 1, fontSize: FONT_SIZE.base },
});
