import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { STEP_FORM_LIMITS, type StepFormField } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText, Well } from '../amazen';
export { FieldInput, PhotoTiles, InlineDay } from './step-form-field-input';

/** One step form's fields — moved here unchanged from step-form-sheet.tsx. */
/** The numbers a sentence names — the limit a note or name may not pass. */
export function errorParams(f: StepFormField): Record<string, unknown> {
  if (f.type === 'note') return { max: STEP_FORM_LIMITS.maxNoteLength };
  if (f.type === 'name') return { max: STEP_FORM_LIMITS.maxNameLength };
  if (f.type === 'photos') return { max: STEP_FORM_LIMITS.maxPhotos };
  return {};
}

/** A field in its well — `.pwell`: its label, Required / Optional, the input, and what is wrong with it. */
export function FieldWell({
  field,
  label,
  error,
  children,
}: {
  field: StepFormField;
  label: string;
  error: string | null;
  children: React.ReactNode;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  return (
    <Well
      style={{
        paddingVertical: amazen.space(3),
        paddingHorizontal: amazen.space(3.25),
        gap: amazen.space(2),
        backgroundColor: c.tile,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: amazen.space(2) }}>
        <AText
          numberOfLines={2}
          style={{
            flex: 1,
            flexShrink: 1,
            color: c.inkMuted,
            fontFamily: amazen.font.mono,
            fontSize: 10.5,
            lineHeight: 14,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </AText>
        <AText
          numberOfLines={1}
          style={{
            flexShrink: 0,
            color: field.required ? c.accent : c.inkMuted,
            fontFamily: amazen.font.mono,
            fontSize: 10,
            lineHeight: 14,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {field.required ? t('common.required') : t('common.optional')}
        </AText>
      </View>
      {children}
      {error ? (
        <AText variant="caption" tone="critical" numberOfLines={3}>
          {error}
        </AText>
      ) : null}
    </Well>
  );
}
