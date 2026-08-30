import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { BlurSheet } from './blur-sheet';
import { SheetPanel } from './sheet-panel';
import { PressableScale } from './pressable-scale';

/**
 * Filtering a personnel file, without a row that scrolls sideways.
 *
 * The types were a horizontal strip of chips, and the question it kept raising
 * was the one a control should never raise: is there more of this? A clipped
 * chip at the screen edge reads as a layout bug at least as often as it reads
 * as "keep going", and adding fades only answered it more politely.
 *
 * A list answers it by not asking. Everything is visible at once, each row
 * carries its COUNT — which the strip could never show — and a document type
 * with nothing behind it is not offered at all, so nobody taps into an empty
 * screen. It also has somewhere to put the one filter that matters most and had
 * no room in a strip of type names: what is waiting on you.
 */

export interface DocumentFilters {
  typeId: string | null;
  year: number | null;
  needsSignature: boolean;
}

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
      {/* The count is the reason this is a list. A strip of chips cannot say
          how much is behind each one, so every tap was a guess. */}
      <Text style={[s.count, { color: colors.textMuted }]}>{count}</Text>
    </PressableScale>
  );

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <SheetPanel title={t('documents.filter.title')} onClose={onClose} maxHeightFraction={0.85}>
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {awaitingCount > 0 && (
            <>
              <Text style={[s.heading, { color: colors.textMuted }]}>
                {t('documents.filter.needsYou')}
              </Text>
              <Row
                icon={filters.needsSignature ? 'checkbox' : 'square-outline'}
                label={t('documents.filter.needsSignature')}
                count={awaitingCount}
                selected={filters.needsSignature}
                onPress={() => onChange({ ...filters, needsSignature: !filters.needsSignature })}
              />
            </>
          )}

          <Text style={[s.heading, { color: colors.textMuted }]}>{t('documents.filter.type')}</Text>
          <Row
            label={t('documents.allTypes')}
            count={countFor({ typeId: null })}
            selected={filters.typeId === null}
            onPress={() => onChange({ ...filters, typeId: null })}
          />
          {types.map((ty) => (
            <Row
              key={ty.id}
              label={ty.label}
              count={countFor({ typeId: ty.id })}
              selected={filters.typeId === ty.id}
              onPress={() => onChange({ ...filters, typeId: ty.id })}
            />
          ))}

          {years.length > 1 && (
            <>
              <Text style={[s.heading, { color: colors.textMuted }]}>{t('documents.filter.year')}</Text>
              <Row
                label={t('documents.allYears')}
                count={countFor({ year: null })}
                selected={filters.year === null}
                onPress={() => onChange({ ...filters, year: null })}
              />
              {years.map((y) => (
                <Row
                  key={y}
                  label={String(y)}
                  count={countFor({ year: y })}
                  selected={filters.year === y}
                  onPress={() => onChange({ ...filters, year: y })}
                />
              ))}
            </>
          )}
        </ScrollView>

        <PressableScale
          onPress={onClose}
          style={[s.done, { backgroundColor: COLORS.primary }]}
        >
          <Text style={s.doneText}>{t('common.done')}</Text>
        </PressableScale>
      </SheetPanel>
    </BlurSheet>
  );
}

const s = StyleSheet.create({
  body: { gap: SPACING.xs, paddingBottom: SPACING.md, paddingTop: SPACING.sm },
  heading: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
  },
  rowLabel: { flex: 1, fontSize: FONT_SIZE.md },
  count: { fontSize: FONT_SIZE.sm, fontVariant: ['tabular-nums'] },
  done: {
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
    minHeight: 52, borderRadius: RADIUS.md, marginTop: SPACING.sm,
  },
  doneText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
});
