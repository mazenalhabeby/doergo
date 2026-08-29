import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
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
        ? `${t(`documents.months.${MONTH_KEYS[item.periodMonth - 1]}`)} ${item.periodYear}`
        : item.periodYear
          ? String(item.periodYear)
          : new Date(item.issuedAt).toLocaleDateString();
    const chip = standingStyle(item.standing);

    return (
      <TouchableOpacity
        style={[s.row, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => open(item)}
        disabled={opening === item.id}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${period}`}
      >
        {/* Fixed-width slot so rows do not shift when a dot appears */}
        <View style={s.dotSlot}>
          {item.unread && <View style={[s.dot, { backgroundColor: COLORS.primary }]} />}
        </View>

        <Ionicons
          name={item.mimeType.startsWith('image/') ? 'image-outline' : 'document-text-outline'}
          size={22}
          color={colors.textMuted}
        />

        <View style={s.body}>
          <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[s.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {item.typeLabel} · {period} · {fileSize(item.sizeBytes)}
          </Text>
          {(item.needsSignature || chip) && (
            <View style={s.chips}>
              {item.needsSignature && (
                <View style={[s.chip, { backgroundColor: colors.warningLight }]}>
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

        {opening === item.id ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        )}
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
          <View style={[s.banner, { backgroundColor: colors.primaryLight, borderColor: COLORS.primary }]}>
            <Ionicons name="create-outline" size={20} color={COLORS.primary} />
            <Text style={[s.bannerText, { color: colors.textPrimary }]}>
              {t('documents.my.awaiting', { count: awaiting.length })}
            </Text>
          </View>
        )}

        {usedTypes.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.tabs}
          >
            <Tab label={t('documents.allTypes')} active={activeType === null} onPress={() => setActiveType(null)} colors={colors} />
            {usedTypes.map((ty) => (
              <Tab key={ty.id} label={ty.label} active={activeType === ty.id} onPress={() => setActiveType(ty.id)} colors={colors} />
            ))}
          </ScrollView>
        )}

        {years.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
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
          <FlatList
            data={visible}
            keyExtractor={(d) => d.id}
            renderItem={renderItem}
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
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  headerSpacer: { width: 26 },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginHorizontal: SPACING.md, marginTop: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },

  tabs: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.xs },
  tab: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full, borderWidth: StyleSheet.hairlineWidth,
  },
  tabSmall: { paddingVertical: 4 },
  tabText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },

  list: { paddingHorizontal: SPACING.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: StyleSheet.hairlineWidth,
  },
  dotSlot: { width: 8, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  meta: { fontSize: FONT_SIZE.xs, marginTop: 2 },
  chips: { flexDirection: 'row', gap: SPACING.xs, marginTop: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  chipText: { fontSize: 11, fontWeight: FONT_WEIGHT.bold },

  empty: { alignItems: 'center', paddingVertical: SPACING.xl * 2, gap: SPACING.xs },
  emptyTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, marginTop: SPACING.sm },
  emptyHint: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingHorizontal: SPACING.xl },
});
