import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../lib/constants';
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
        <FilterPill
          icon="pricetag-outline"
          label={typeLabel}
          active={!!filters.typeId}
          onPress={() => setPicking('type')}
          onClear={filters.typeId ? () => onChange({ ...filters, typeId: null }) : undefined}
          colors={colors}
        />

        {years.length > 1 && (
          <FilterPill
            icon="calendar-outline"
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

          Same pill, different tone — so the row reads as one family rather than
          a switch that wandered in from another screen.
        */}
        {awaitingCount > 0 && (
          <FilterPill
            icon="create-outline"
            label={String(awaitingCount)}
            badge
            tone={COLORS.warning}
            onTone={COLORS.slate900}
            active={filters.needsSignature}
            onPress={() => onChange({ ...filters, needsSignature: !filters.needsSignature })}
            colors={colors}
          />
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

/**
 * The pill, in every position it appears in.
 *
 * Filled rather than outlined, and SOLID when it is on. A hairline outline that
 * gains a faint tint when selected asks somebody to compare two pale things to
 * find out what is applied; a chip that fills with its own colour states it from
 * across the room. The shadow takes the pill's colour with it, which is what
 * separates a considered control from a rectangle with a border.
 *
 * One component for all three — the year, the type and the signature toggle —
 * because three near-identical pills maintained separately end up three
 * different heights, and mismatched heights in one row is the detail that makes
 * an interface look cheap.
 */
function FilterPill({
  icon,
  label,
  active,
  onPress,
  onClear,
  colors,
  tone = COLORS.primary,
  onTone = COLORS.white,
  badge = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
  onClear?: () => void;
  colors: { border: string; textPrimary: string; textSecondary: string; surfaceRaised: string };
  /** The colour this pill takes when it is on. */
  tone?: string;
  /** What stays legible on top of that colour — never assumed to be white. */
  onTone?: string;
  /** Render the label as a counter rather than a name. */
  badge?: boolean;
}) {
  const ink = active ? onTone : colors.textPrimary;
  const showClear = active && !!onClear;

  return (
    <View
      style={[
        s.pill,
        active
          ? [s.pillOn, { backgroundColor: tone, shadowColor: tone }]
          : [s.pillOff, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }],
        showClear && s.pillWithClear,
      ]}
    >
      <PressableScale onPress={onPress} style={s.pillTap} accessibilityRole="button">
        <Ionicons name={icon} size={15} color={active ? onTone : colors.textSecondary} />
        <Text
          style={[s.pillText, badge && s.pillCount, { color: ink }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {!badge && !showClear && (
          <Ionicons name="chevron-down" size={13} color={active ? onTone : colors.textSecondary} />
        )}
      </PressableScale>

      {/* Clearing one facet without opening it: the thing a single "Filter"
          button could never offer, because it had nothing to clear from. */}
      {showClear && (
        <PressableScale onPress={onClear} hitSlop={10} style={s.pillClear} accessibilityRole="button">
          <Ionicons name="close" size={13} color={onTone} />
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
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        style={[
          s.row,
          isSelected
            ? { backgroundColor: COLORS.primary }
            : { backgroundColor: colors.surfaceRaised },
        ]}
      >
        <Ionicons
          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
          size={20}
          color={isSelected ? COLORS.white : colors.textMuted}
        />
        <Text
          style={[s.rowLabel, { color: isSelected ? COLORS.white : colors.textPrimary }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {/* The count is why this is a list and not a strip of chips: a chip
            cannot say how much is behind it, so every tap was a guess. */}
        <Text style={[s.count, { color: isSelected ? COLORS.white : colors.textMuted }]}>
          {count}
        </Text>
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
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.xs,
  },

  /* A fixed height, not padding that happens to add up. A counter pill and a
     word pill sit in the same row, and a two-pixel difference between them is
     exactly what reads as unfinished. */
  pill: {
    flexDirection: 'row', alignItems: 'center',
    height: 38, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, flexShrink: 1,
  },
  pillWithClear: { paddingRight: SPACING.xs },
  pillOff: {
    borderWidth: StyleSheet.hairlineWidth,
    ...SHADOWS.sm,
  },
  /* The shadow takes the pill's own colour — a grey shadow under a coloured
     chip looks printed on, a tinted one looks lit. */
  pillOn: {
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 4,
  },

  pillTap: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs + 2,
    height: '100%', flexShrink: 1,
  },
  pillText: {
    fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: -0.1, flexShrink: 1,
  },
  pillCount: { fontVariant: ['tabular-nums'], minWidth: 10, textAlign: 'center' },
  pillClear: { paddingHorizontal: SPACING.xs, height: '100%', justifyContent: 'center' },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm, marginTop: SPACING.sm,
  },
  searchInput: { flex: 1, paddingVertical: SPACING.sm, fontSize: FONT_SIZE.base },

  body: { gap: SPACING.xs, paddingVertical: SPACING.sm },
  /* The rows speak the same language as the pills: filled at rest, solid when
     chosen, so moving between the two does not feel like two designs. */
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    minHeight: 48, borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
  },
  rowLabel: { flex: 1, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.medium },
  count: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, fontVariant: ['tabular-nums'] },
});
