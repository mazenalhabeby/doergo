import { memo, useCallback, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../pressable-scale';
import { useTheme } from '../../contexts/theme-context';
import { SPACING, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';
import { CardFieldGroup } from './card-field-row';
import type { CardExtraRow } from './card-review';

/**
 * WHAT THE CARD SAID THAT NO FIELD WANTED.
 *
 * A Facebook page, an IBAN, opening hours, a Skype handle, a second office,
 * whatever the card printed after its own colon. Every one of them was read by
 * the phone and then dropped in silence, because the record has eight columns
 * and a business card does not. `Customer.details` is a JSON `[{label, value}]`
 * list that exists precisely for this, so keeping one costs a row rather than a
 * migration — and the member decides, per row, whether it is worth keeping.
 *
 * ⚠️ THE LABEL IS EDITABLE, and that is the feature rather than a courtesy. The
 * reader names what it recognises ("Facebook", "IBAN") and falls back to the
 * card's own word where the card supplied one ("Notruf"), but a card can print
 * anything and only the person holding it knows what it is for. Renaming is one
 * tap into the label; dropping it is one tap on the bin.
 *
 * ⚠️ A translation key is rendered with `t()`; the CARD'S own word is rendered
 * verbatim. Translating a company's own word for something invents a fact, and
 * writing our English word onto a German record is the mirror of the same bug.
 * The distinction is kept all the way to `cardDetails`, which resolves it once,
 * at save.
 */
export function CardExtrasGroup({
  rows,
  /** False on the contact road — there is no `details` on a contact person. */
  kept,
  onRename,
  onChangeValue,
  onRemove,
}: {
  rows: readonly CardExtraRow[];
  kept: boolean;
  onRename: (id: string, label: string) => void;
  onChangeValue: (id: string, value: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <CardFieldGroup
      title={t('scan.extras')}
      // Two different sentences, because they answer two different questions:
      // "what is this list" when it will be saved, and "why am I looking at
      // something that will not be" when it will not.
      hint={kept ? t('scan.extrasHint') : t('scan.extrasNotKept')}
    >
      {rows.map((row) => (
        <ExtraRow
          key={row.id}
          row={row}
          onRename={onRename}
          onChangeValue={onChangeValue}
          onRemove={onRemove}
        />
      ))}
    </CardFieldGroup>
  );
}

/**
 * One kept thing: what to call it, what it says, and a way to drop it.
 *
 * Memoised on its props and taking the row id rather than a closure written per
 * row at the call site — the same rule as `CardFieldRow`, and for the same
 * reason: without it every row re-renders on every keystroke in any of them.
 */
const ExtraRow = memo(function ExtraRow({
  row,
  onRename,
  onChangeValue,
  onRemove,
}: {
  row: CardExtraRow;
  onRename: (id: string, label: string) => void;
  onChangeValue: (id: string, value: string) => void;
  onRemove: (id: string) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const { t } = useTranslation();

  const rename = useCallback((v: string) => onRename(row.id, v), [onRename, row.id]);
  const change = useCallback((v: string) => onChangeValue(row.id, v), [onChangeValue, row.id]);
  const remove = useCallback(() => onRemove(row.id), [onRemove, row.id]);

  /*
    The member's own word wins, then the card's, then ours. `labelKey` is the
    only one of the three that goes through `t()` — see the file header.
  */
  const label = row.rename ?? row.label ?? (row.labelKey ? t(row.labelKey) : '');

  return (
    <View style={s.row}>
      <View style={s.head}>
        <TextInput
          value={label}
          onChangeText={rename}
          placeholder={t('scan.extraLabel')}
          placeholderTextColor={colors.textMuted}
          style={s.label}
          accessibilityLabel={t('scan.extraLabel')}
        />
        <PressableScale
          onPress={remove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('scan.removeExtra')}
        >
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </PressableScale>
      </View>
      <TextInput
        value={row.value}
        onChangeText={change}
        placeholder={t('scan.extraValue')}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={s.value}
        accessibilityLabel={label || t('scan.extraValue')}
      />
    </View>
  );
});

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    // The same compact row as a field, so the two lists read as one screen
    // rather than as a screen with a widget bolted to the bottom of it.
    row: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      paddingVertical: SPACING.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
    label: {
      flex: 1,
      fontSize: FONT_SIZE.xs,
      color: c.textMuted,
      letterSpacing: 0.6,
      fontWeight: FONT_WEIGHT.medium,
      padding: 0,
    },
    // No box around either input: the row IS the field, exactly as in
    // `CardFieldRow`. A border here would bring back the bordered-card look
    // that made the old review unreadable, at a smaller size.
    value: { fontSize: FONT_SIZE.lg, color: c.textPrimary, paddingVertical: SPACING.xs, padding: 0, marginTop: 2 },
  });
