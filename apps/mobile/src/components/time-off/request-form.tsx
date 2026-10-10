import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { COLORS } from '../../lib/constants';
import { FilterChip } from '../filter-chip';
import { REASON_TYPE_KEYS, formatLongDate } from './helpers';
import { styles } from './styles';

/** The request for the picked range: kind, a note, Clear / Send. */
export function TimeOffRequestForm({
  rangeStart,
  rangeEnd,
  rangeDays,
  locale,
  reasonType,
  onReasonType,
  reasonNotes,
  onReasonNotes,
  isSubmitting,
  onClear,
  onSubmit,
}: {
  rangeStart: Date;
  rangeEnd: Date;
  rangeDays: number;
  locale: string;
  reasonType: string;
  onReasonType: (key: string) => void;
  reasonNotes: string;
  onReasonNotes: (text: string) => void;
  isSubmitting: boolean;
  onClear: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View style={[styles.formCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.formTitle, { color: colors.textPrimary }]}>{t('timeOff.requestForm.title')}</Text>

      {/* Date range display */}
      <View style={[styles.formDateRow, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
        <Text style={styles.formDateText}>
          {formatLongDate(rangeStart, locale)} – {formatLongDate(rangeEnd, locale)} ({rangeDays} {rangeDays > 1 ? t('common.days') : t('common.day')})
        </Text>
      </View>

      {/* Reason type chips */}
      <Text style={[styles.formLabel, { color: colors.textPrimary }]}>{t('timeOff.requestForm.reasonLabel')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        <View style={styles.chipRow}>
          {REASON_TYPE_KEYS.map(key => (
            <FilterChip
              key={key}
              label={t(`timeOff.reasonTypes.${key}`)}
              active={reasonType === key}
              onPress={() => onReasonType(key)}
            />
          ))}
        </View>
      </ScrollView>

      {/* Optional notes */}
      <Text style={[styles.formLabel, { color: colors.textPrimary }]}>{t('timeOff.requestForm.notesLabel')}</Text>
      <TextInput
        style={[styles.notesInput, { borderColor: colors.border, color: colors.textPrimary }]}
        placeholder={t('timeOff.requestForm.notesPlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={reasonNotes}
        onChangeText={onReasonNotes}
        multiline
        maxLength={500}
      />

      {/* Action buttons */}
      <View style={styles.formButtons}>
        <TouchableOpacity style={[styles.clearButton, { borderColor: colors.border }]} onPress={onClear}>
          <Text style={[styles.clearButtonText, { color: colors.textSecondary }]}>{t('timeOff.requestForm.clearSelection')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <>
              <Ionicons name="paper-plane" size={16} color={COLORS.white} />
              <Text style={styles.submitButtonText}>{t('timeOff.requestForm.submitRequest')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
