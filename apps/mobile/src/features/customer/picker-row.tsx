import { memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon } from '@/components/amazen/ink-icon';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '@/components/pressable-scale';
import { ClientAvatar } from './client-avatar';
import { type MobileCustomer } from '@/lib/api';
import { useTheme } from '@/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '@/lib/constants';

/** The search field waits this long after the last keystroke — the client list's figure. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * One character matches most of a book, so the request is wasted and the list
 * it returns is not a shortlist. Two is the web dialog's figure as well.
 *
 * ⚠️ Interpolated into `searchHint` as `{{min}}`, never as `{{count}}`:
 * i18next reads `count` as a plural SELECTOR and would go looking for
 * `searchHint_one` / `searchHint_other`, which the catalogue does not have.
 */
export const MIN_SEARCH = 2;

/** A shortlist, not a page. Eight is what the web dialog asks for. */
export const RESULT_LIMIT = 8;

/**
 * One result.
 *
 * ⚠️ Memoised, and `onSelect` is the caller's stable callback rather than an
 * arrow written at the call site — the row re-renders on every keystroke
 * otherwise and the memo is decoration. The client is handed BACK whole rather
 * than its id, so the sheet can print the chosen name without looking it up.
 */
export const PickerRow = memo(function PickerRow({
  client,
  selected,
  divider,
  onSelect,
}: {
  client: MobileCustomer;
  selected: boolean;
  divider: boolean;
  onSelect: (client: MobileCustomer) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const { t } = useTranslation();
  const press = useCallback(() => onSelect(client), [onSelect, client]);

  /*
    The line under the name.

    Where they already work comes FIRST, ahead of the email — it is the fact
    that tells two people with the same name apart, and it is the one that says
    "you already have this person" to somebody about to type them again.
  */
  const subtitle = client.contactOf
    ? t('customers.record.alreadyContactAt', { name: client.contactOf.name })
    : client.email || client.phone || '';

  return (
    <PressableScale
      onPress={press}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={subtitle ? `${client.name}, ${subtitle}` : client.name}
      style={[
        s.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        selected && { backgroundColor: colors.primaryLight },
      ]}
    >
      <ClientAvatar customer={client} size={30} />
      <View style={s.rowText}>
        <Text style={s.rowName} numberOfLines={1}>
          {client.name}
        </Text>
        {!!subtitle && (
          <Text style={s.rowSub} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {selected && <Icon name="checkLine" size={17} color={COLORS.primary} />}
    </PressableScale>
  );
});

export const styles = (c: ThemeColors) =>
  StyleSheet.create({
    label: {
      fontSize: FONT_SIZE.sm,
      color: c.textMuted,
      fontWeight: FONT_WEIGHT.medium,
      marginTop: SPACING.md,
      marginBottom: SPACING.xs,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      backgroundColor: c.input,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.inputBorder,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      height: 46,
    },
    searchInput: { flex: 1, fontSize: FONT_SIZE.xl, color: c.textPrimary, padding: 0 },
    hint: {
      fontSize: FONT_SIZE.base,
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: SPACING.lg,
    },
    loading: { paddingVertical: SPACING.md },
    results: {
      marginTop: SPACING.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: RADIUS.md,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
    },
    rowText: { flex: 1, minWidth: 0 },
    rowName: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.medium, color: c.textPrimary },
    rowSub: { fontSize: FONT_SIZE.sm, color: c.textMuted, marginTop: 1 },
  });
