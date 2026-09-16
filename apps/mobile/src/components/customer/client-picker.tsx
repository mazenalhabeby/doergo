import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { clientFilterQuery, type ClientKind } from '@hbcfield/shared/client';
import { PressableScale } from '../pressable-scale';
import { Skeleton } from '../skeleton';
import { ClientAvatar } from './client-avatar';
import { customersApi, type MobileCustomer } from '../../lib/api';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';

/** The search field waits this long after the last keystroke — the client list's figure. */
const SEARCH_DEBOUNCE_MS = 300;
/**
 * One character matches most of a book, so the request is wasted and the list
 * it returns is not a shortlist. Two is the web dialog's figure as well.
 *
 * ⚠️ Interpolated into `searchHint` as `{{min}}`, never as `{{count}}`:
 * i18next reads `count` as a plural SELECTOR and would go looking for
 * `searchHint_one` / `searchHint_other`, which the catalogue does not have.
 */
const MIN_SEARCH = 2;
/** A shortlist, not a page. Eight is what the web dialog asks for. */
const RESULT_LIMIT = 8;

/**
 * FIND SOMEBODY WHO IS ALREADY IN THE BOOK.
 *
 * ⚠️ This exists to stop a SECOND record for one human being. Without it the
 * only way to name a contact is to type them, so the person who is already a
 * client — with their history, their reminders and their jobs — quietly gains a
 * twin, and the two halves of what is known about them never meet again. That
 * is the damage; the convenience is incidental.
 *
 * ⚠️ The SERVER is asked for the right kind, through `clientFilterQuery` in
 * shared rather than a hand-written `type=` — filtering a fetched page instead
 * would narrow a list that was already capped at eight, so "companies" would
 * quietly mean "the companies among the first eight clients by name".
 *
 * ⚠️ Contacts are INCLUDED (`contacts: 'all'`). Somebody who already contacts
 * another company is exactly who is being looked for, and hiding them is how
 * the duplicate this component exists to prevent gets created anyway. A row
 * that IS already a contact says where — see `contactOf`.
 *
 * ⚠️ No client-side widening of any kind. `GET /customers` is already scoped to
 * the caller's own CRM abilities server-side, so what comes back IS their
 * visible book; a filter added here could only make the list stricter than the
 * rule it mirrors, which is the failure this codebase keeps re-learning.
 */
export function ClientPicker({
  /** What to search FOR — the OPPOSITE end of the link being made. */
  kind,
  /**
   * The record the picker was opened from.
   *
   * Dropped from the results: the server refuses a client as its own contact,
   * so offering it can only produce a refusal for something nobody meant.
   */
  excludeId,
  selectedId,
  onSelect,
}: {
  kind: ClientKind;
  excludeId: string;
  selectedId: string | null;
  onSelect: (client: MobileCustomer) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const { t } = useTranslation();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<MobileCustomer[]>([]);
  const [loading, setLoading] = useState(false);

  /*
    WHICH ANSWER IS STILL THE CURRENT QUESTION.

    ⚠️ Every request carries a number and only the newest one is allowed to
    write state. Typing "sie" fires after "si" and the two answers race: on a
    slow connection the shorter query's longer list arrives last and overwrites
    the narrower one, so the member watches their search visibly UN-narrow
    itself as they type. Aborting is not available here — `fetchWithAuth` takes
    no signal — so the stale answer is discarded instead, which costs the same
    on screen.

    It doubles as the unmount guard: the counter is bumped on the way out, so a
    reply landing after the sheet closes writes nothing.
  */
  const seq = useRef(0);

  useEffect(() => () => { seq.current += 1; }, []);

  const query = search.trim();

  useEffect(() => {
    if (query.length < MIN_SEARCH) {
      // Not a search yet: clear what the last one found rather than leaving a
      // stale shortlist under a field that no longer says what produced it.
      seq.current += 1;
      setResults([]);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const rows = await customersApi.list({
            search: query,
            limit: RESULT_LIMIT,
            // The two parameters the server reads, built in shared. `contacts`
            // is set on top of the kind because no single filter says both.
            ...clientFilterQuery(kind === 'COMPANY' ? 'companies' : 'people'),
            contacts: 'all',
            portalResident: false,
          });
          if (seq.current !== mine) return;
          setResults(rows.filter((r) => r.id !== excludeId));
        } catch {
          // A failed search shows nothing found rather than an error banner: the
          // way out is the same either way — type again, or create them.
          if (seq.current === mine) setResults([]);
        } finally {
          if (seq.current === mine) setLoading(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, kind, excludeId]);

  const findLabel = t(kind === 'COMPANY' ? 'customers.record.findCompany' : 'customers.record.findPerson');

  return (
    <View>
      <Text style={s.label}>{findLabel}</Text>
      <View style={s.searchBar}>
        <Ionicons name="search" size={17} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t(kind === 'COMPANY' ? 'customers.record.findCompanyHint' : 'customers.record.findPersonHint')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={s.searchInput}
          accessibilityLabel={findLabel}
        />
        {!!search && (
          <PressableScale
            onPress={() => setSearch('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('common.clear', 'Clear')}
          >
            <Ionicons name="close-circle" size={17} color={colors.textMuted} />
          </PressableScale>
        )}
      </View>

      {query.length < MIN_SEARCH ? (
        <Text style={s.hint}>{t('customers.record.searchHint', { min: MIN_SEARCH })}</Text>
      ) : loading ? (
        <View style={s.loading}>
          <Skeleton.Line width="100%" height={22} />
          <Skeleton.Line width="70%" height={22} style={{ marginTop: SPACING.sm }} />
        </View>
      ) : results.length === 0 ? (
        <Text style={s.hint}>
          {t(kind === 'COMPANY' ? 'customers.record.noCompanyFound' : 'customers.record.noPersonFound')}
        </Text>
      ) : (
        <View style={s.results}>
          {results.map((r, i) => (
            <PickerRow
              key={r.id}
              client={r}
              selected={selectedId === r.id}
              divider={i > 0}
              onSelect={onSelect}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * One result.
 *
 * ⚠️ Memoised, and `onSelect` is the caller's stable callback rather than an
 * arrow written at the call site — the row re-renders on every keystroke
 * otherwise and the memo is decoration. The client is handed BACK whole rather
 * than its id, so the sheet can print the chosen name without looking it up.
 */
const PickerRow = memo(function PickerRow({
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
        <Text style={s.rowName} numberOfLines={1}>{client.name}</Text>
        {!!subtitle && <Text style={s.rowSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {selected && <Ionicons name="checkmark" size={17} color={COLORS.primary} />}
    </PressableScale>
  );
});

const styles = (c: ThemeColors) =>
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
