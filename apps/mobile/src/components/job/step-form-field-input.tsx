import { Pressable, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { STEP_FORM_LIMITS, type StepFormField } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { JobField } from './job-ui';
import { SignPad, type SignPadHandle } from './sign-pad';
import { type FormDraft } from './step-form-logic';
import { PhotoTiles, InlineDay } from './step-form-pickers';
export { PhotoTiles, InlineDay } from './step-form-pickers';

/** The input of one step-form field, and its photo and day pickers — moved here unchanged from step-form-sheet.tsx. */
/** The one input a field type draws. */
export function FieldInput({
  field,
  label,
  value,
  onChange,
  padRef,
  onTouching,
}: {
  field: StepFormField;
  label: string;
  value: FormDraft[string];
  onChange: (v: FormDraft[string]) => void;
  padRef: (h: SignPadHandle | null) => void;
  onTouching: (on: boolean) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const text = typeof value === 'string' ? value : '';

  switch (field.type) {
    case 'note': {
      const max = STEP_FORM_LIMITS.maxNoteLength;
      return (
        <View style={{ gap: amazen.space(1) }}>
          <JobField
            value={text}
            onChangeText={onChange}
            placeholder={t('job.form.typeHere')}
            multiline
            maxLength={max}
            accessibilityLabel={label}
          />
          {text.length >= max * 0.9 ? (
            <AText
              variant="caption"
              tone={text.length >= max ? 'warn' : 'muted'}
              numeric
              style={{ alignSelf: 'flex-end' }}
            >{`${text.length} / ${max}`}</AText>
          ) : null}
        </View>
      );
    }
    case 'name':
      return (
        <JobField
          value={text}
          onChangeText={onChange}
          placeholder={t('job.form.namePlaceholder')}
          maxLength={STEP_FORM_LIMITS.maxNameLength}
          autoCapitalize="words"
          accessibilityLabel={label}
        />
      );
    case 'number':
      return (
        <JobField
          value={text}
          onChangeText={onChange}
          placeholder="0"
          keyboardType="decimal-pad"
          maxLength={24}
          accessibilityLabel={label}
        />
      );
    case 'choice':
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(1.5) }}>
          {(field.options ?? []).map((o) => {
            const on = text === o;
            return (
              <Pressable
                key={o}
                onPress={() => onChange(on ? '' : o)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={o}
                style={({ pressed }) => ({
                  maxWidth: '100%',
                  minHeight: 38,
                  justifyContent: 'center',
                  borderRadius: amazen.radius.full,
                  paddingHorizontal: amazen.space(3.5),
                  paddingVertical: amazen.space(1.5),
                  backgroundColor: on ? c.accentTint : c.well,
                  borderWidth: 1.5,
                  borderColor: on ? c.accent : 'transparent',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <AText
                  variant="caption"
                  numberOfLines={2}
                  style={{ color: on ? c.accent : c.ink, fontSize: 13, flexShrink: 1 }}
                >
                  {o}
                </AText>
              </Pressable>
            );
          })}
        </View>
      );
    case 'yesno':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1 }}>
            {value === true ? t('common.yes') : t('common.no')}
          </AText>
          <Switch
            value={value === true}
            onValueChange={(b) => onChange(b)}
            trackColor={{ true: c.accentSolid, false: c.well }}
            accessibilityLabel={label}
          />
        </View>
      );
    case 'date':
      return <InlineDay value={text} onChange={onChange} />;
    case 'photos':
      return <PhotoTiles photos={Array.isArray(value) ? value : []} onChange={onChange} />;
    case 'signature':
      return (
        <SignPad
          ref={padRef}
          hint={t(field.id === 'customer_signature' ? 'job.finish.handOver' : 'job.finish.signHere')}
          onInk={(v) => onChange(v)}
          onTouching={onTouching}
        />
      );
    default:
      return null;
  }
}
