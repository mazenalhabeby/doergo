import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { AText, GlassInput, SectionLabel } from '@/components/amazen';
import { durationInRange, durationMinutes, type DurationFields } from '@hbcfield/shared/client';
import { minutesText } from './approval-duration';

/**
 * The time a decision counts, typed as hours and minutes (the web's DurationField): hours on a decimal pad
 * ("1,5" h is 1 h 30 min), minutes on a number pad. The line under it states the range, and turns into the
 * error when the fields cannot be read or the total is outside 1 min – 24 h.
 */
export function ApprovalDurationField({
  value,
  onChange,
}: {
  value: DurationFields;
  onChange: (v: DurationFields) => void;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const total = durationMinutes(value);
  const empty = value.h.trim() === '' && value.m.trim() === '';
  const ok = durationInRange(total);
  const field = (part: 'h' | 'm') => (
    <View style={{ width: 76 }}>
      <GlassInput
        value={value[part]}
        onChangeText={(v) => onChange({ ...value, [part]: v })}
        keyboardType={part === 'h' ? 'decimal-pad' : 'number-pad'}
        maxLength={part === 'h' ? 5 : 4}
        accessibilityLabel={`${t('approvals.duration')} · ${t(part === 'h' ? 'approvals.unitHours' : 'approvals.unitMinutes')}`}
      />
    </View>
  );
  return (
    <>
      <SectionLabel>{t('approvals.duration')}</SectionLabel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
        {field('h')}
        <AText variant="body" tone="onGlass">
          {t('approvals.unitHours')}
        </AText>
        {field('m')}
        <AText variant="body" tone="onGlass">
          {t('approvals.unitMinutes')}
        </AText>
      </View>
      {ok ? (
        <AText variant="caption" tone="muted">
          = {minutesText(total, t)} · {t('approvals.durationRange')}
        </AText>
      ) : (
        <AText variant="caption" tone={empty ? 'muted' : 'critical'}>
          {total === null ? t('approvals.durationUnreadable') : t('approvals.durationRange')}
        </AText>
      )}
    </>
  );
}
