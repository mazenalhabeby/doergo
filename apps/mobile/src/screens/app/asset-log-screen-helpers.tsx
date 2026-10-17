import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DateField } from '../../components';
import { useFormPalette } from '../../components/equipment/equipment-frame';
import { type KindLogField, type LogValueProblem } from '@hbcfield/shared/client';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type FieldColors } from '../../lib/constants';

/** AssetLogScreen's module-level helpers, moved here unchanged so its sections can read them too. */
/** One field, drawn for its type. The problem, if any, is said under it in plain words. */
export function FieldInput({
  field,
  value,
  onChange,
  problem,
  photo,
  onPhoto,
  onRemovePhoto,
  colors,
  t,
}: {
  field: KindLogField;
  value: string;
  onChange: (v: string) => void;
  problem?: LogValueProblem;
  photo: { uri: string; mime: string } | null;
  onPhoto: (from: 'camera' | 'library') => void;
  onRemovePhoto: () => void;
  colors: FieldColors;
  t: (k: string, d: string, o?: Record<string, unknown>) => string;
}) {
  const { COLORS } = useFormPalette();
  const border = problem ? COLORS.error : colors.border;
  const label = `${field.label}${field.required ? ' *' : ''}`;
  const error = problem ? (
    <Text style={s.error}>{t(`logbook.problem.${problem.code}`, PROBLEM_FALLBACK[problem.code])}</Text>
  ) : null;

  if (field.type === 'choice') {
    return (
      <View style={s.block}>
        <Text style={[s.label, { color: colors.textMuted }]}>{label}</Text>
        <View style={s.chips}>
          {(field.options ?? []).map((o) => {
            const on = value === o;
            return (
              <TouchableOpacity
                key={o}
                onPress={() => onChange(on ? '' : o)}
                style={[
                  s.chip,
                  { borderColor: problem ? border : colors.border },
                  on && { backgroundColor: `${COLORS.primary}1a`, borderColor: COLORS.primary },
                ]}
              >
                <Text
                  style={{
                    fontSize: FONT_SIZE.sm,
                    color: on ? COLORS.primary : colors.textPrimary,
                    fontWeight: on ? '700' : '400',
                  }}
                >
                  {o}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {error}
      </View>
    );
  }

  if (field.type === 'photo') {
    return (
      <View style={s.block}>
        <Text style={[s.label, { color: colors.textMuted }]}>{label}</Text>
        <View style={[s.photoRow, { borderColor: border }]}>
          <Ionicons name={photo ? 'image' : 'image-outline'} size={18} color={photo ? '#22c55e' : colors.textMuted} />
          <Text style={{ flex: 1, fontSize: FONT_SIZE.sm, color: colors.textMuted }}>
            {photo ? t('expenses.photoAttached', 'Photo attached') : t('expenses.noPhoto', 'No photo')}
          </Text>
          {photo ? (
            <TouchableOpacity onPress={onRemovePhoto}>
              <Text style={s.link}>{t('logbook.removePhoto', 'Remove')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={() => onPhoto('camera')}>
                <Text style={s.link}>{t('expenses.takePhoto', 'Take one')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onPhoto('library')}>
                <Text style={s.link}>{t('logbook.library', 'Library')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {error}
      </View>
    );
  }

  if (field.type === 'date') {
    /*
      A date the entry RECORDS — the day on a TÜV sticker, when the tyres were
      bought — not the day it happened, so no entry-date window: a sticker's
      next inspection is in the future by nature. Clearable unless required.
    */
    return (
      <View style={s.block}>
        <Text style={[s.label, { color: colors.textMuted }]}>{label}</Text>
        <DateField
          value={value}
          onChange={onChange}
          clearable={!field.required}
          title={field.label}
          placeholder={t('logbook.pickDate', 'Choose a day')}
          invalid={!!problem}
        />
        {error}
      </View>
    );
  }

  const numeric = field.type === 'number' || field.type === 'money';
  const suffix = field.type === 'money' ? '€' : field.unit;
  return (
    <View style={s.block}>
      <Text style={[s.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={[s.inputRow, { borderColor: border }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={numeric ? 'decimal-pad' : 'default'}
          placeholder={field.type === 'money' ? '0,00' : ''}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="sentences"
          multiline={field.type === 'text'}
          style={[s.input, { flex: 1, color: colors.textPrimary }, field.type === 'money' && s.money]}
        />
        {!!suffix && <Text style={[s.suffix, { color: colors.textMuted }]}>{suffix}</Text>}
      </View>
      {field.meter && !problem && (
        <Text style={[s.hint, { color: colors.textMuted, textAlign: 'left' }]}>
          {t('logbook.meterHint', 'The reading on the counter now')}
        </Text>
      )}
      {error}
    </View>
  );
}

export const PROBLEM_FALLBACK: Record<LogValueProblem['code'], string> = {
  required: 'This is needed',
  'not-a-number': 'That is not a number',
  'out-of-range': 'That number is out of range',
  'not-a-date': 'Choose a day',
  'not-an-option': 'Choose one of these',
  'too-long': 'That is too long',
};

export const s = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  hint: { fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: 4 },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  asset: { fontSize: FONT_SIZE.sm, flex: 1 },

  block: { marginBottom: SPACING.md },
  label: { fontSize: FONT_SIZE.xs, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: SPACING.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
  },
  input: { fontSize: FONT_SIZE.base, paddingVertical: 10 },
  money: { fontSize: 22, fontWeight: '700' },
  suffix: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, marginLeft: SPACING.sm },
  boxed: { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md },
  error: { color: COLORS.error, fontSize: FONT_SIZE.xs, marginTop: 4 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: SPACING.md, paddingVertical: 8 },

  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  link: { color: COLORS.primary, fontSize: FONT_SIZE.xs, fontWeight: '700' },

  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    height: 46,
    marginBottom: SPACING.lg,
  },
  secondaryText: { fontSize: FONT_SIZE.sm, fontWeight: '700' },
  primary: {
    borderRadius: RADIUS.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
  },
  primaryText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: '700' },
  footnote: { fontSize: FONT_SIZE.xs, textAlign: 'center', marginTop: SPACING.md },
});
