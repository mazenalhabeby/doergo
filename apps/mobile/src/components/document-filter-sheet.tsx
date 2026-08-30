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
 * Filtering a personnel file that keeps growing.
 *
 * The first version was one long list of everything, which was already a full
 * screen of scrolling at ten document types — and the year section, at the
 * bottom, was pushed off it entirely. Both lists only grow: an organization
 * adds document types over years, and every January adds a year for ever.
 *
 * So the two axes are separated rather than stacked. A pane each means neither
 * can bury the other however long it gets, and each is shaped for what it
 * holds: types are words, so they are a list with a search box; years are four
 * characters, so they are a grid where a decade fits in three rows.
 *
 * Two things survive from the first version because they were right. Every row
 * carries its COUNT, which a strip of chips could never show and which turns
 * every tap from a guess into a decision. And nothing empty is offered, so no
 * choice leads to a blank screen.
 */

export interface DocumentFilters {
  typeId: string | null;
  year: number | null;
  needsSignature: boolean;
}

/** Above this many types, hunting by eye is slower than typing. */
const SEARCH_APPEARS_AT = 8;

export function DocumentFilterSheet({
  visible,
  filters,
  types,
  years,
  countFor,
  awaitingCount,
  onChange,
  onClose,
}: {
  visible: boolean;
  filters: DocumentFilters;
  types: { id: string; label: string }[];
  years: number[];
  /** How many documents a choice would leave. Counting is the caller's job. */
  countFor: (patch: Partial<DocumentFilters>) => number;
  awaitingCount: number;
  onChange: (next: DocumentFilters) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [pane, setPane] = useState<'type' | 'year'>('type');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? types.filter((ty) => ty.label.toLowerCase().includes(q)) : types;
  }, [types, query]);

  const Row = ({
    label,
    count,
    selected,
    onPress,
    icon,
  }: {
    label: string;
    count: number;
    selected: boolean;
    onPress: () => void;
    icon?: keyof typeof Ionicons.glyphMap;
  }) => (
    <PressableScale
      onPress={onPress}
      style={[
        s.row,
        { borderColor: selected ? COLORS.primary : colors.border },
        selected && { backgroundColor: `${COLORS.primary}14` },
      ]}
    >
      <Ionicons
        name={icon ?? (selected ? 'radio-button-on' : 'radio-button-off')}
        size={18}
        color={selected ? COLORS.primary : colors.textSecondary}
      />
      <Text style={[s.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.count, { color: colors.textMuted }]}>{count}</Text>
    </PressableScale>
  );

  const Segment = ({ id, label }: { id: 'type' | 'year'; label: string }) => (
    <PressableScale
      onPress={() => setPane(id)}
      style={[
        s.segment,
        pane === id && { backgroundColor: COLORS.primary },
      ]}
    >
      <Text
        style={[
          s.segmentText,
          { color: pane === id ? '#fff' : colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </PressableScale>
  );

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <SheetPanel title={t('documents.filter.title')} onClose={onClose} maxHeightFraction={0.85}>
        {/*
          A different axis from the other two, so it sits above the panes rather
          than inside one — and it is the filter somebody reaches for most.
        */}
        {awaitingCount > 0 && (
          <View style={s.pinned}>
            <Row
              icon={filters.needsSignature ? 'checkbox' : 'square-outline'}
              label={t('documents.filter.needsSignature')}
              count={awaitingCount}
              selected={filters.needsSignature}
              onPress={() => onChange({ ...filters, needsSignature: !filters.needsSignature })}
            />
          </View>
        )}

        {years.length > 1 && (
          <View style={[s.segmented, { backgroundColor: colors.surfaceRaised }]}>
            <Segment id="type" label={t('documents.filter.type')} />
            <Segment id="year" label={t('documents.filter.year')} />
          </View>
        )}

        {pane === 'type' || years.length <= 1 ? (
          <>
            {/* Typing beats hunting once the list is longer than a screen. */}
            {types.length > SEARCH_APPEARS_AT && (
              <View style={[s.search, { borderColor: colors.border }]}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('documents.filter.searchTypes')}
                  placeholderTextColor={colors.textMuted}
                  style={[s.searchInput, { color: colors.textPrimary }]}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {query.length > 0 && (
                  <PressableScale onPress={() => setQuery('')} style={s.searchClear}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </PressableScale>
                )}
              </View>
            )}

            <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
              {!query && (
                <Row
                  label={t('documents.allTypes')}
                  count={countFor({ typeId: null })}
                  selected={filters.typeId === null}
                  onPress={() => onChange({ ...filters, typeId: null })}
                />
              )}
              {shown.map((ty) => (
                <Row
                  key={ty.id}
                  label={ty.label}
                  count={countFor({ typeId: ty.id })}
                  selected={filters.typeId === ty.id}
                  onPress={() => onChange({ ...filters, typeId: ty.id })}
                />
              ))}
              {shown.length === 0 && (
                <Text style={[s.empty, { color: colors.textMuted }]}>
                  {t('documents.filter.noMatch')}
                </Text>
              )}
            </ScrollView>
          </>
        ) : (
          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            {/*
              A grid, because a year is four characters and a row each would
              waste a screen on a decade. Newest first: a payslip from last
              month is looked for far more often than one from 2019.
            */}
            <View style={s.yearGrid}>
              <YearCell
                label={t('documents.allYears')}
                count={countFor({ year: null })}
                selected={filters.year === null}
                onPress={() => onChange({ ...filters, year: null })}
                wide
                colors={colors}
              />
              {years.map((y) => (
                <YearCell
                  key={y}
                  label={String(y)}
                  count={countFor({ year: y })}
                  selected={filters.year === y}
                  onPress={() => onChange({ ...filters, year: y })}
                  colors={colors}
                />
              ))}
            </View>
          </ScrollView>
        )}

        <PressableScale onPress={onClose} style={[s.done, { backgroundColor: COLORS.primary }]}>
          <Text style={s.doneText}>{t('common.done')}</Text>
        </PressableScale>
      </SheetPanel>
    </BlurSheet>
  );
}

function YearCell({
  label,
  count,
  selected,
  onPress,
  wide,
  colors,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
  wide?: boolean;
  colors: { border: string; textPrimary: string; textMuted: string };
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={[
        s.yearCell,
        wide && s.yearCellWide,
        { borderColor: selected ? COLORS.primary : colors.border },
        selected && { backgroundColor: `${COLORS.primary}14` },
      ]}
    >
      <Text style={[s.yearLabel, { color: colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.count, { color: colors.textMuted }]}>{count}</Text>
    </PressableScale>
  );
}

const s = StyleSheet.create({
  pinned: { paddingTop: SPACING.sm },
  segmented: {
    flexDirection: 'row', gap: SPACING.xs, padding: 3,
    borderRadius: RADIUS.full, marginTop: SPACING.md,
  },
  segment: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.xs, borderRadius: RADIUS.full,
  },
  segmentText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm, marginTop: SPACING.sm,
  },
  searchInput: { flex: 1, paddingVertical: SPACING.sm, fontSize: FONT_SIZE.md },
  searchClear: { padding: 2 },

  body: { gap: SPACING.xs, paddingVertical: SPACING.sm },
  // Denser than the first version: ten types were a full screen of scrolling
  // before a single year was visible.
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1, borderRadius: RADIUS.md,
    paddingVertical: SPACING.xs + 2, paddingHorizontal: SPACING.md,
  },
  rowLabel: { flex: 1, fontSize: FONT_SIZE.md },
  count: { fontSize: FONT_SIZE.sm, fontVariant: ['tabular-nums'] },
  empty: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: SPACING.lg },

  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  yearCell: {
    flexBasis: '31%', flexGrow: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: SPACING.xs, borderWidth: 1, borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm,
  },
  yearCellWide: { flexBasis: '100%' },
  yearLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },

  done: {
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
    minHeight: 52, borderRadius: RADIUS.md, marginTop: SPACING.sm,
  },
  doneText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
});
