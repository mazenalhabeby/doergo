import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { documentsApi, type MemberDocument, type DocumentType } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../src/lib/constants';
import { Skeleton, ScreenContainer } from '../../src/components';

/*
  The member's own file, on a phone.

  Modelled on the payroll portal this replaces — type tabs across the top, a
  year filter, one row per document — because that is the shape people already
  know, and being unsurprising is the whole job here.

  Read-only. Issuing and template work stay on the web; a phone is where a
  document is READ, in a van, five minutes before it is needed.

  No row carries a link. One is minted on tap, and that mint is what records the
  document as opened — so a list that pre-fetched links would make the delivery
  evidence meaningless.
*/

const MONTH_KEYS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/*
  A glyph and a hue per KIND of document.

  Every row used the same outline page icon, so a payslip, a contract and a
  driving licence were distinguishable only by reading them — in a list of
  twenty-six, mostly payslips. Colour and shape do that work at a glance, and
  reading becomes confirmation rather than search.

  Keyed off the type's machine key, with a fallback, so an organization that
  invents its own type still gets something sensible rather than nothing.
*/
type Glyph = { icon: keyof typeof Ionicons.glyphMap; hue: string };

function glyphFor(typeKey: string, isCredential: boolean): Glyph {
  if (typeKey.includes('payslip') || typeKey.includes('salary')) {
    return { icon: 'cash-outline', hue: COLORS.primary };
  }
  if (typeKey.includes('contract')) return { icon: 'document-text-outline', hue: COLORS.inProgress };
  if (typeKey.includes('policy') || typeKey.includes('safety')) {
    return { icon: 'shield-checkmark-outline', hue: COLORS.amber };
  }
  if (typeKey.includes('annual') || typeKey.includes('statement')) {
    return { icon: 'calendar-outline', hue: COLORS.purple };
  }
  if (isCredential) return { icon: 'ribbon-outline', hue: COLORS.warning };
  return { icon: 'document-outline', hue: COLORS.slate500 };
}

export default function DocumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();

  const [documents, setDocuments] = useState<MemberDocument[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    try {
      // Both in one round trip. On a van's connection two sequential requests
      // is a visibly slower screen.
      const [docs, tys] = await Promise.all([documentsApi.list(), documentsApi.listTypes()]);
      setDocuments(docs);
      setTypes(tys);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('documents.loadFailed'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /* Filtered on the device: a personnel file is tens of rows, so switching a
     tab should be instant rather than a spinner. */
  const visible = useMemo(
    () =>
      documents.filter((d) => {
        if (activeType && d.typeId !== activeType) return false;
        if (year !== null && (d.periodYear ?? new Date(d.issuedAt).getFullYear()) !== year) return false;
        return true;
      }),
    [documents, activeType, year],
  );

  /*
    Grouped by year, newest first.

    Twenty payslips in a flat list is a wall: every row looks the same and the
    only way to find March is to count. A year header turns scrolling into
    navigation, and the sticky header means you always know where you are.

    Anything WAITING is lifted into its own section at the top, because it is
    the only part of this screen that is asking something of the person reading
    it — and in date order it sits among the payslips and gets missed.
  */
  const sections = useMemo(() => {
    const waiting = visible.filter((d) => d.needsSignature);
    const rest = visible.filter((d) => !d.needsSignature);

    const byYear = new Map<number, MemberDocument[]>();
    for (const d of rest) {
      const y = d.periodYear ?? new Date(d.issuedAt).getFullYear();
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(d);
    }

    const out: { title: string; key: string; data: MemberDocument[] }[] = [];
    if (waiting.length > 0) {
      out.push({ title: t('documents.sectionWaiting'), key: 'waiting', data: waiting });
    }
    for (const y of [...byYear.keys()].sort((a, b) => b - a)) {
      out.push({ title: String(y), key: String(y), data: byYear.get(y)! });
    }
    return out;
  }, [visible, t]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const d of documents) set.add(d.periodYear ?? new Date(d.issuedAt).getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [documents]);

  /** Only tabs with something behind them — an empty tab is a dead end. */
  const usedTypes = useMemo(() => {
    const ids = new Set(documents.map((d) => d.typeId));
    return types.filter((ty) => ids.has(ty.id));
  }, [types, documents]);

  const awaiting = useMemo(() => documents.filter((d) => d.needsSignature), [documents]);

  const open = useCallback(async (doc: MemberDocument) => {
    /*
      A document waiting on the member goes to the signing flow, not to a
      viewer. Opening it in a PDF reader and leaving them to find the way back
      is how a signature request gets forgotten.
    */
    if (doc.needsSignature) {
      const type = types.find((ty) => ty.id === doc.typeId);
      router.push({
        pathname: '/sign-document',
        params: { id: doc.id, title: doc.title, mode: (type as any)?.signatureMode ?? 'IN_APP' },
      } as any);
      return;
    }
    setOpening(doc.id);
    try {
      const res = await documentsApi.downloadUrl(doc.id);
      if (!res?.url) throw new Error(t('documents.openFailed'));
      await Linking.openURL(res.url);
      // The row's unread dot is now stale — reload rather than patch it, so
      // what the screen shows is what the server recorded.
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('documents.openFailed'));
    } finally {
      setOpening(null);
    }
  }, [load, t, toast, types, router]);

  /*
    Soft background from the THEME (it inverts in dark mode), hue from the fixed
    palette. Pairing a theme background with a fixed foreground is what keeps
    the chip readable on both grounds — a fixed pair would go invisible on one.
  */
  const standingStyle = (standing: string | null) => {
    switch (standing) {
      case 'EXPIRED': return { bg: colors.errorLight, fg: COLORS.error, label: t('documents.standing.expired') };
      case 'EXPIRING': return { bg: colors.warningLight, fg: COLORS.warning, label: t('documents.standing.expiring') };
      case 'VALID': return { bg: colors.successLight, fg: COLORS.success, label: t('documents.standing.valid') };
      default: return null;
    }
  };

  const renderItem = ({ item }: { item: MemberDocument }) => {
    const period =
      item.periodMonth && item.periodYear
        ? t(`documents.months.${MONTH_KEYS[item.periodMonth - 1]}`)
        : item.periodYear
          ? String(item.periodYear)
          : new Date(item.issuedAt).toLocaleDateString();
    const chip = standingStyle(item.standing);
    const g = glyphFor(item.typeKey, !!item.standing);
    const busy = opening === item.id;

    return (
      <TouchableOpacity
        style={[s.row, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => open(item)}
        disabled={busy}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${period}`}
      >
        {/* A tinted disc, not a bare outline. Colour and shape identify the kind
            of document before any of the text is read. */}
        <View style={[s.glyph, { backgroundColor: g.hue + '22' }]}>
          <Ionicons name={g.icon} size={20} color={g.hue} />
          {item.unread && (
            <View style={[s.unreadDot, { backgroundColor: COLORS.primary, borderColor: colors.card }]} />
          )}
        </View>

        <View style={s.body}>
          <Text
            style={[
              s.title,
              { color: colors.textPrimary },
              // Unread reads as heavier, the way an unread message does.
              item.unread && s.titleUnread,
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>

          <View style={s.metaRow}>
            <Text style={[s.meta, { color: colors.textMuted }]} numberOfLines={1}>
              {item.typeLabel}
            </Text>
            <Text style={[s.metaDot, { color: colors.textMuted }]}>·</Text>
            <Text style={[s.meta, { color: colors.textMuted }]}>{fileSize(item.sizeBytes)}</Text>
          </View>

          {(item.needsSignature || chip) && (
            <View style={s.chips}>
              {item.needsSignature && (
                <View style={[s.chip, { backgroundColor: colors.warningLight }]}>
                  <Ionicons name="create-outline" size={11} color={COLORS.warning} />
                  <Text style={[s.chipText, { color: COLORS.warning }]}>
                    {t('documents.needsSignature')}
                  </Text>
                </View>
              )}
              {chip && (
                <View style={[s.chip, { backgroundColor: chip.bg }]}>
                  <Text style={[s.chipText, { color: chip.fg }]}>{chip.label}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* The period on the right, so the column aligns down the list and the
            eye can run it like an index rather than reading every line. */}
        <View style={s.tail}>
          {busy ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <>
              <Text style={[s.period, { color: colors.textSecondary }]} numberOfLines={1}>
                {period}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('documents.my.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScreenContainer>
        {/* Anything waiting on the reader goes above the list, not in date order
            among twelve payslips where it gets missed. */}
        {awaiting.length > 0 && (
          <TouchableOpacity
            style={[s.banner, { backgroundColor: colors.warningLight, borderColor: COLORS.warning }]}
            onPress={() => open(awaiting[0]!)}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <View style={[s.bannerIcon, { backgroundColor: COLORS.warning }]}>
              <Ionicons name="create-outline" size={18} color="#FFFFFF" />
            </View>
            <View style={s.bannerBody}>
              <Text style={[s.bannerText, { color: colors.textPrimary }]}>
                {t('documents.my.awaiting', { count: awaiting.length })}
              </Text>
              <Text style={[s.bannerSub, { color: colors.textSecondary }]} numberOfLines={1}>
                {awaiting[0]!.title}
              </Text>
            </View>
            {/* Tappable, because a notice you cannot act on is just decoration. */}
            <Ionicons name="chevron-forward" size={18} color={COLORS.warning} />
          </TouchableOpacity>
        )}

        {usedTypes.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            /*
              flexGrow AND flexShrink zero.

              A horizontal ScrollView in a flex column has no intrinsic height,
              so the FlatList below it took the space and squashed these rows to
              a few pixels — the chips rendered clipped through their own text.
            */
            style={s.chipRow}
            contentContainerStyle={s.tabs}
          >
            <Tab label={t('documents.allTypes')} active={activeType === null} onPress={() => setActiveType(null)} colors={colors} />
            {usedTypes.map((ty) => (
              <Tab key={ty.id} label={ty.label} active={activeType === ty.id} onPress={() => setActiveType(ty.id)} colors={colors} />
            ))}
          </ScrollView>
        )}

        {years.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow} contentContainerStyle={s.tabs}>
            <Tab label={t('documents.allYears')} active={year === null} onPress={() => setYear(null)} colors={colors} small />
            {years.map((y) => (
              <Tab key={y} label={String(y)} active={year === y} onPress={() => setYear(y)} colors={colors} small />
            ))}
          </ScrollView>
        )}

        {isLoading ? (
          <View style={s.list}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton.Line key={i} height={64} style={{ marginBottom: SPACING.sm, borderRadius: RADIUS.md }} />
            ))}
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(d) => d.id}
            renderItem={renderItem}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (
              <View style={[s.sectionHeader, { backgroundColor: colors.background }]}>
                <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
                <View style={[s.sectionRule, { backgroundColor: colors.border }]} />
              </View>
            )}
            contentContainerStyle={[s.list, { paddingBottom: insets.bottom + SPACING.xl }]}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} tintColor={COLORS.primary} />
            }
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name="file-tray-outline" size={40} color={colors.textMuted} />
                <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                  {documents.length === 0 ? t('documents.my.empty') : t('documents.noMatches')}
                </Text>
                <Text style={[s.emptyHint, { color: colors.textMuted }]}>
                  {documents.length === 0 ? t('documents.my.emptyHint') : t('documents.noMatchesHint')}
                </Text>
              </View>
            }
          />
        )}
      </ScreenContainer>
    </View>
  );
}

function Tab({
  label, active, onPress, colors, small,
}: {
  label: string; active: boolean; onPress: () => void; colors: any; small?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[
        s.tab,
        small && s.tabSmall,
        {
          backgroundColor: active ? COLORS.primary : 'transparent',
          borderColor: active ? COLORS.primary : colors.border,
        },
      ]}
    >
      <Text style={[s.tabText, { color: active ? '#FFFFFF' : colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  headerSpacer: { width: 26 },

  // The one thing on this screen asking something of the reader.
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    marginHorizontal: SPACING.md, marginTop: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1,
  },
  bannerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  bannerBody: { flex: 1, minWidth: 0 },
  bannerText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  bannerSub: { fontSize: FONT_SIZE.sm, marginTop: 1 },

  // Height is intrinsic to the chips; the row must not be stretched or squeezed.
  chipRow: { flexGrow: 0, flexShrink: 0 },
  tabs: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.xs, alignItems: 'center' },
  tab: {
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: RADIUS.full, borderWidth: StyleSheet.hairlineWidth,
  },
  tabSmall: { paddingVertical: 4, paddingHorizontal: SPACING.sm },
  tabText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },

  list: { paddingHorizontal: SPACING.md },

  // Sticky, so the year is always visible while scrolling twenty payslips.
  sectionHeader: { paddingTop: SPACING.md, paddingBottom: SPACING.xs, gap: SPACING.xs },
  sectionTitle: {
    fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 1.1, textTransform: 'uppercase',
  },
  sectionRule: { height: StyleSheet.hairlineWidth },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg, borderWidth: StyleSheet.hairlineWidth,
  },
  glyph: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // Sits on the glyph rather than in its own column, so the row keeps one
  // rhythm whether or not anything is unread.
  unreadDot: {
    position: 'absolute', top: -2, right: -2,
    width: 11, height: 11, borderRadius: 6, borderWidth: 2,
  },

  body: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.medium },
  titleUnread: { fontWeight: FONT_WEIGHT.bold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { fontSize: FONT_SIZE.sm },
  metaDot: { fontSize: FONT_SIZE.sm },

  chips: { flexDirection: 'row', gap: SPACING.xs, marginTop: 5, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full,
  },
  chipText: { fontSize: 11, fontWeight: FONT_WEIGHT.bold },

  // Right-aligned period: the column the eye runs down to find a month.
  tail: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 110 },
  period: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },

  empty: { alignItems: 'center', paddingVertical: SPACING.xl * 2, gap: SPACING.xs },
  emptyTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACING.sm },
  emptyHint: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingHorizontal: SPACING.xl },
});
