import { memo, useCallback, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, type KeyboardTypeOptions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../pressable-scale';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';
import type { CardFieldKey } from './card-review';

/**
 * ONE ROW, for every field a scanned card produces.
 *
 * ⚠️ There is one of these because there was nearly one per field. The screen
 * this replaces drew five identical bordered cards, each with its own badge and
 * its own "Pick a different line" link — three of them EMPTY and still full
 * height, so the eye had nothing to land on and the two guesses that genuinely
 * needed checking shouted no louder than the email the reader had proved.
 *
 * ⚠️ Only `attention` colours anything. A row is quiet unless the reader
 * inferred the value or found nothing — which is the whole reason the reader
 * distinguishes `certain` from `likely` in the first place. Badging every row
 * spends the member's attention on fields that do not need it, and then they
 * stop reading the badge that does.
 *
 * ⚠️ Memoised, and `onChange` / `onPickLine` take the key rather than being
 * arrows written per row at the call site — otherwise every row re-renders on
 * every keystroke in any of them and the memo is decoration.
 */
export const CardFieldRow = memo(function CardFieldRow({
  fieldKey,
  label,
  value,
  /** The reader inferred this, or found nothing. The only thing that colours. */
  attention,
  keyboardType,
  autoCapitalize = 'sentences',
  /** The lines this card gave, shown inline when the member asks for them. */
  lines,
  expanded,
  onChange,
  onToggleLines,
  onPickLine,
}: {
  fieldKey: CardFieldKey;
  label: string;
  value: string;
  attention: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  lines: readonly string[];
  expanded: boolean;
  onChange: (key: CardFieldKey, value: string) => void;
  onToggleLines: (key: CardFieldKey) => void;
  onPickLine: (key: CardFieldKey, line: string) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const { t } = useTranslation();

  const change = useCallback((v: string) => onChange(fieldKey, v), [onChange, fieldKey]);
  const toggle = useCallback(() => onToggleLines(fieldKey), [onToggleLines, fieldKey]);

  return (
    <View style={[s.row, attention && s.rowAttention]}>
      <View style={s.head}>
        <Text style={[s.label, attention && { color: COLORS.amber }]} numberOfLines={1}>
          {label}
        </Text>
        {/*
          The way to a different line, on every row and shouting on none. It is
          an icon rather than a sentence because it repeats eight times down the
          screen, and eight copies of "Pick a different line" is most of what
          made the old review unreadable.
        */}
        <PressableScale
          onPress={toggle}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={t('scan.otherLine')}
        >
          <Ionicons
            name={expanded ? 'chevron-up' : 'list-outline'}
            size={16}
            color={expanded ? COLORS.primary : colors.textMuted}
          />
        </PressableScale>
      </View>

      <TextInput
        value={value}
        onChangeText={change}
        placeholder={t('scan.empty')}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize === 'none' ? false : undefined}
        style={s.input}
        accessibilityLabel={label}
      />

      {expanded && (
        <View style={s.lines}>
          {lines.length === 0 ? (
            <Text style={s.noLines}>{t('scan.noLines')}</Text>
          ) : (
            lines.map((line, i) => (
              <LineChoice key={`${i}-${line}`} fieldKey={fieldKey} line={line} onPick={onPickLine} />
            ))
          )}
        </View>
      )}
    </View>
  );
});

/**
 * One line off the card, offered as an answer.
 *
 * Its own component so the list does not rebuild a closure per line per render
 * of the row above it — the same reason `PickerRow` exists in `client-picker`.
 */
const LineChoice = memo(function LineChoice({
  fieldKey,
  line,
  onPick,
}: {
  fieldKey: CardFieldKey;
  line: string;
  onPick: (key: CardFieldKey, line: string) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const pick = useCallback(() => onPick(fieldKey, line), [onPick, fieldKey, line]);
  return (
    <PressableScale onPress={pick} accessibilityRole="button" accessibilityLabel={line} style={s.lineRow}>
      <Text style={s.lineText} numberOfLines={1}>{line}</Text>
    </PressableScale>
  );
});

/** A heading over a group of rows — "Read from the card", "Worth a look". */
export function CardFieldGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  return (
    <View style={s.group}>
      <Text style={s.groupTitle}>{title}</Text>
      {!!hint && <Text style={s.groupHint}>{hint}</Text>}
      {children}
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    /*
      A compact row, not a card. An empty field costs a label and a line of
      placeholder here; in the design this replaces it cost the same full-height
      bordered box as a field with content in it, three times over.
    */
    row: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      paddingVertical: SPACING.sm,
    },
    // The one thing that colours: a left edge, not a badge. It marks the row
    // without competing with the value written in it.
    rowAttention: {
      borderLeftWidth: 2,
      borderLeftColor: COLORS.amber,
      paddingLeft: SPACING.md,
      marginLeft: -SPACING.md,
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
    label: {
      flex: 1,
      fontSize: FONT_SIZE.xs,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      fontWeight: FONT_WEIGHT.medium,
    },
    // No box around the input: the row IS the field. A border here would bring
    // back the five-identical-cards look at a smaller size.
    input: { fontSize: FONT_SIZE.lg, color: c.textPrimary, paddingVertical: SPACING.xs, padding: 0, marginTop: 2 },
    lines: { marginTop: SPACING.sm, gap: SPACING.xs, marginBottom: SPACING.xs },
    lineRow: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: RADIUS.sm,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
    },
    lineText: { fontSize: FONT_SIZE.sm, color: c.textPrimary },
    noLines: { fontSize: FONT_SIZE.sm, color: c.textMuted, paddingVertical: SPACING.sm },
    group: { marginTop: SPACING.xl },
    groupTitle: {
      fontSize: FONT_SIZE.sm,
      fontWeight: FONT_WEIGHT.bold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    groupHint: { fontSize: FONT_SIZE.sm, color: c.textMuted, marginTop: SPACING.xs, lineHeight: 18 },
  });
