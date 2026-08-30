import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { BlurSheet } from './blur-sheet';
import { SheetPanel } from './sheet-panel';
import { PressableScale } from './pressable-scale';

/**
 * Filters as pills that state their own value.
 *
 * The earlier attempt put every facet in one sheet behind a single button, and
 * that sheet had to grow with the data: ten document types filled it, and the
 * year section was pushed off the bottom. The fault was never the idea of
 * filtering — it was putting all of it behind one door.
 *
 * A pill per facet fixes both halves at once. THE CURRENT STATE IS ALWAYS
 * VISIBLE — "Type: Payslip" rather than a button that says "Filter" and makes
 * somebody open it to find out what is on. And each picker holds ONE facet, so
 * a list of a hundred document types is one short screen about types rather
 * than something burying the years underneath it.
 *
 * Three pills, fixed: they fit a phone without scrolling sideways, which was
 * the complaint that started all of this.
 */

export interface DocumentFilters {
  typeId: string | null;
  year: number | null;
  needsSignature: boolean;
}

export interface FilterOption {
  id: string;
  label: string;
  count: number;
}

/** Above this many options, hunting by eye is slower than typing. */
const SEARCH_APPEARS_AT = 8;

export function DocumentFilterBar({
  filters,
  types,
  years,
  countFor,
  awaitingCount,
  onChange,
}: {
  filters: DocumentFilters;
  types: { id: string; label: string }[];
  years: number[];
  countFor: (patch: Partial<DocumentFilters>) => number;
  awaitingCount: number;
  onChange: (next: DocumentFilters) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [picking, setPicking] = useState<'type' | 'year' | null>(null);

  const typeLabel = filters.typeId
    ? types.find((ty) => ty.id === filters.typeId)?.label ?? t('documents.allTypes')
    : t('documents.filter.anyType');

  const typeOptions = useMemo<FilterOption[]>(
    () => types.map((ty) => ({ id: ty.id, label: ty.label, count: countFor({ typeId: ty.id }) })),
    [types, countFor],
  );

  const yearOptions = useMemo<FilterOption[]>(
    () => years.map((y) => ({ id: String(y), label: String(y), count: countFor({ year: y }) })),
    [years, countFor],
  );

  return (
    <>
      <View style={s.bar}>
        <Pill
          label={typeLabel}
          active={!!filters.typeId}
          onPress={() => setPicking('type')}
          onClear={filters.typeId ? () => onChange({ ...filters, typeId: null }) : undefined}
          colors={colors}
        />

        {years.length > 1 && (
          <Pill
            label={filters.year !== null ? String(filters.year) : t('documents.filter.anyYear')}
            active={filters.year !== null}
            onPress={() => setPicking('year')}
            onClear={filters.year !== null ? () => onChange({ ...filters, year: null }) : undefined}
            colors={colors}
          />
        )}

        {/*
          Not a picker: it has two states, and anything with two states that
          hides one of them behind a sheet is a menu pretending to be a switch.
        */}
        {awaitingCount > 0 && (
          <PressableScale
            onPress={() => onChange({ ...filters, needsSignature: !filters.needsSignature })}
            style={[
              s.pill,
              {
                borderColor: filters.needsSignature ? COLORS.warning : colors.border,
                backgroundColor: filters.needsSignature ? colors.warningLight : 'transparent',
              },
            ]}
          >
            <Ionicons
              name="create-outline"
              size={14}
              color={filters.needsSignature ? COLORS.warning : colors.textSecondary}
            />
            <Text style={[s.pillText, { color: colors.textPrimary }]}>{awaitingCount}</Text>
          </PressableScale>
        )}
      </View>

      <PickerSheet
        visible={picking === 'type'}
        title={t('documents.filter.type')}
        allLabel={t('documents.allTypes')}
        allCount={countFor({ typeId: null })}
        options={typeOptions}
        selected={filters.typeId}
        searchPlaceholder={t('documents.filter.searchTypes')}
        onSelect={(id) => { onChange({ ...filters, typeId: id }); setPicking(null); }}
        onClose={() => setPicking(null)}
      />

      <PickerSheet
        visible={picking === 'year'}
        title={t('documents.filter.year')}
        allLabel={t('documents.allYears')}
        allCount={countFor({ year: null })}
        options={yearOptions}
        selected={filters.year !== null ? String(filters.year) : null}
        onSelect={(id) => { onChange({ ...filters, year: id === null ? null : Number(id) }); setPicking(null); }}
        onClose={() => setPicking(null)}
      />
    </>
  );
}

function Pill({
  label,
  active,
  onPress,
  onClear,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onClear?: () => void;
  colors: { border: string; textPrimary: string; textSecondary: string };
}) {
  return (
    <View
      style={[
        s.pill,
        { borderColor: active ? COLORS.primary : colors.border },
        active && { backgroundColor: `${COLORS.primary}14` },
      ]}
    >
      <PressableScale onPress={onPress} style={s.pillTap}>
        <Text
          style={[s.pillText, { color: active ? COLORS.primary : colors.textPrimary }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Ionicons name="chevron-down" size={14} color={active ? COLORS.primary : colors.textSecondary} />
      </PressableScale>

      {/* Clearing one facet without opening it: the thing a single "Filter"
          button could never offer, because it had nothing to clear from. */}
      {onClear && (
        <PressableScale onPress={onClear} hitSlop={8} style={s.pillClear}>
          <Ionicons name="close" size={14} color={COLORS.primary} />
        </PressableScale>
      )}
    </View>
  );
}

/**
 * One facet, one screen.
 *
 * Short by construction — it holds the options for a single thing — so it stays
 * a short sheet however many document types an organization ends up with, and
 * it can never push another facet out of view because there is no other facet
 * in it.
 */
function PickerSheet({
  visible,
  title,
  allLabel,
  allCount,
  options,
  selected,
  searchPlaceholder,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  allLabel: string;
  allCount: number;
  options: FilterOption[];
  selected: string | null;
  searchPlaceholder?: string;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const Row = ({ id, label, count }: { id: string | null; label: string; count: number }) => {
    const isSelected = selected === id;
    return (
      <PressableScale
        onPress={() => onSelect(id)}
        style={[
          s.row,
          { borderColor: isSelected ? COLORS.primary : colors.border },
          isSelected && { backgroundColor: `${COLORS.primary}14` },
        ]}
      >
        <Ionicons
          name={isSelected ? 'radio-button-on' : 'radio-button-off'}
          size={18}
          color={isSelected ? COLORS.primary : colors.textSecondary}
        />
        <Text style={[s.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>{label}</Text>
        {/* The count is why this is a list and not a strip of chips: a chip
            cannot say how much is behind it, so every tap was a guess. */}
        <Text style={[s.count, { color: colors.textMuted }]}>{count}</Text>
      </PressableScale>
    );
  };

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <SheetPanel title={title} onClose={onClose} maxHeightFraction={0.8}>
        {searchPlaceholder && options.length > SEARCH_APPEARS_AT && (
          <View style={[s.search, { borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.textMuted}
              style={[s.searchInput, { color: colors.textPrimary }]}
              autoCorrect={false}
            />
          </View>
        )}

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {!query && <Row id={null} label={allLabel} count={allCount} />}
          {shown.map((o) => (
            <Row key={o.id} id={o.id} label={o.label} count={o.count} />
          ))}
        </ScrollView>
      </SheetPanel>
    </BlurSheet>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: RADIUS.full,
    paddingLeft: SPACING.md, paddingRight: SPACING.sm, flexShrink: 1,
  },
  pillTap: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: SPACING.xs, flexShrink: 1 },
  pillText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, flexShrink: 1 },
  pillClear: { paddingLeft: SPACING.xs, paddingVertical: SPACING.xs },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, marginTop: SPACING.sm,
  },
  searchInput: { flex: 1, paddingVertical: SPACING.sm, fontSize: FONT_SIZE.md },

  body: { gap: SPACING.xs, paddingVertical: SPACING.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1, borderRadius: RADIUS.md,
    paddingVertical: SPACING.xs + 2, paddingHorizontal: SPACING.md,
  },
  rowLabel: { flex: 1, fontSize: FONT_SIZE.md },
  count: { fontSize: FONT_SIZE.sm, fontVariant: ['tabular-nums'] },
});
