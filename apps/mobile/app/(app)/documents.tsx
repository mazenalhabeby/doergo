import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  TextInput,
  Platform,
  RefreshControl,
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
import {
  Skeleton, ScreenContainer, SupplyDocumentSheet, PressableScale,
} from '../../src/components';
import { waitingOnMember } from '@hbcfield/shared/client';

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
  /*
    Search and grouping, not a filter sheet.

    Three versions in, the filter itself was the wrong idea: a modal with panes
    and counts is a search UI, borrowed for somebody browsing their own thirty
    documents. What that person actually does is either look for one thing they
    can name, or scan for a kind of thing — so the screen offers exactly those
    two, both visible without a tap, and neither of which cares whether the
    organization has ten document types or a hundred.
  */
  const [query, setQuery] = useState('');
  const [groupBy, setGroupBy] = useState<'year' | 'type'>('year');
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  type Requirement = Awaited<ReturnType<typeof documentsApi.requirements>>[number];
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [supplying, setSupplying] = useState(false);

  const load = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true);
    try {
      // Both in one round trip. On a van's connection two sequential requests
      // is a visibly slower screen.
      const [docs, tys, reqs] = await Promise.all([
        documentsApi.list(),
        documentsApi.listTypes(),
        // What is still expected from them — a different question from what
        // they have, and the one this screen never asked.
        documentsApi.requirements().catch(() => []),
      ]);
      setDocuments(docs);
      setTypes(tys);
      setRequirements(reqs);
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
  /*
    One box across everything a person might remember.

    They do not think "type equals payslip, year equals 2025" — they think
    "payslip", or "2025", or "gas". Matching the title, the type and the year
    with the same words means the thing they half-remember finds it, whichever
    of the three it was.
  */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((d) => {
      if (onlyWaiting && !d.needsSignature) return false;
      if (!q) return true;
      const year = String(d.periodYear ?? new Date(d.issuedAt).getFullYear());
      return (
        d.title.toLowerCase().includes(q) ||
        d.typeLabel.toLowerCase().includes(q) ||
        year.includes(q)
      );
    });
  }, [documents, query, onlyWaiting]);

  /** What is still expected FROM them, and is their move rather than the office's. */
  const outstanding = useMemo(
    () => requirements.filter((r) => waitingOnMember(r)),
    [requirements],
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

    /*
      Grouped by year or by type, and by nothing else.

      Grouping is what a filter was really being asked to do: "show me my
      payslips" is a way of saying "put the payslips together". Doing it as
      grouping rather than filtering keeps everything else on screen — so the
      answer to "how many payslips" and "what else is there" is the same
      scroll, and nothing is hidden behind a control somebody has to remember
      to clear.
    */
    const buckets = new Map<string, MemberDocument[]>();
    for (const d of rest) {
      const key =
        groupBy === 'type'
          ? d.typeLabel
          : String(d.periodYear ?? new Date(d.issuedAt).getFullYear());
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(d);
    }

    const keys = [...buckets.keys()].sort((a, b) =>
      // Years: newest first. Types: alphabetical, because there is no natural
      // order and a stable one is easier to scan twice.
      groupBy === 'year' ? Number(b) - Number(a) : a.localeCompare(b),
    );

    const out: { title: string; key: string; count: number; data: MemberDocument[] }[] = [];
    if (waiting.length > 0) {
      out.push({
        title: t('documents.sectionWaiting'),
        key: 'waiting',
        count: waiting.length,
        data: waiting,
      });
    }
    for (const k of keys) {
      out.push({ title: k, key: k, count: buckets.get(k)!.length, data: buckets.get(k)! });
    }
    return out;
  }, [visible, groupBy, t]);

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
    /*
      A WET_INK document is never "awaiting" — the app cannot clear it, so
      leaving it in the signing queue would be a task nobody can finish. But
      saying nothing is worse: it looks like an ordinary file, and the member
      never learns they have to sign a printed copy and return it.
    */
    const onPaper = types.find((ty) => ty.id === item.typeId)?.signatureMode === 'WET_INK';
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

          {(item.needsSignature || chip || onPaper) && (
            <View style={s.chips}>
              {onPaper && (
                <View style={[s.chip, { backgroundColor: colors.inProgressLight }]}>
                  <Ionicons name="print-outline" size={11} color={COLORS.inProgress} />
                  <Text style={[s.chipText, { color: COLORS.inProgress }]}>
                    {t('documents.signOnPaper')}
                  </Text>
                </View>
              )}
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
        {/* Only when the organization actually asks its members for something.
            An upload button on an organization that issues everything is an
            invitation to be refused. */}
        {types.some((ty) => ty.direction === 'SUPPLIED' && ty.isActive) ? (
          <TouchableOpacity
            onPress={() => setSupplying(true)}
            accessibilityRole="button"
            accessibilityLabel={t('documents.supply.action')}
            hitSlop={10}
          >
            <Ionicons name="add-circle-outline" size={26} color={COLORS.primary} />
          </TouchableOpacity>
        ) : (
          <View style={s.headerSpacer} />
        )}
      </View>

      <SupplyDocumentSheet
        types={types}
        visible={supplying}
        onClose={() => setSupplying(false)}
        onSubmitted={() => load(true)}
      />

      <ScreenContainer>
        {/*
          What is still expected FROM the member.

          The screen only ever showed what somebody HAS, so a licence that was
          never sent was invisible — a tidy file and a missing document look
          identical when the list is built from documents. Only the items whose
          next move is theirs appear: chasing somebody for a licence they sent
          yesterday is how a product teaches people to ignore it.
        */}
        {outstanding.length > 0 && (
          <View style={[s.needed, { borderColor: COLORS.warning, backgroundColor: colors.warningLight }]}>
            <Text style={[s.neededTitle, { color: colors.textPrimary }]}>
              {t('documents.required.title')}
            </Text>
            {outstanding.map((r) => (
              <PressableScale
                key={r.typeId}
                onPress={() => setSupplying(true)}
                style={s.neededRow}
                accessibilityRole="button"
              >
                <Ionicons name="add-circle-outline" size={18} color={COLORS.warning} />
                <View style={s.neededBody}>
                  <Text style={[s.neededLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                    {r.label}
                  </Text>
                  <Text style={[s.neededState, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t(`documents.required.state.${r.state}`)}
                  </Text>
                </View>
                {r.blocksWork && (
                  <View style={[s.blockPill, { backgroundColor: COLORS.warning }]}>
                    <Text style={s.blockPillText}>{t('documents.required.blocksWork')}</Text>
                  </View>
                )}
              </PressableScale>
            ))}
          </View>
        )}

        {/* Anything waiting on the reader goes above the list, not in date order
            among twelve payslips where it gets missed. */}
        {awaiting.length > 0 && (
          <TouchableOpacity
            style={[s.banner, { backgroundColor: colors.warningLight, borderColor: COLORS.warning }]}
            /*
              Shows ALL of them, not the first one.

              Tapping "4 documents need your signature" opened a single
              document, which is the one thing the sentence does not say. It
              filters the list to those four instead, so the count in the banner
              and what appears underneath are the same set.
            */
            onPress={() => { setOnlyWaiting(true); setQuery(''); }}
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
                {t('documents.my.awaitingHint')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.warning} />
          </TouchableOpacity>
        )}

        {/*
          One box, and a grouping switch. No modal at all.

          Somebody browsing their own file is doing one of two things: looking
          for a thing they can name, or scanning for a kind of thing. Search
          answers the first without caring how many document types exist, and
          grouping answers the second WITHOUT HIDING ANYTHING — which a filter
          could not, and which is why a filter always needed clearing again.
        */}
        <View style={s.controls}>
          <View style={[s.search, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('documents.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              style={[s.searchInput, { color: colors.textPrimary }]}
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {query.length > 0 && Platform.OS !== 'ios' && (
              <PressableScale onPress={() => setQuery('')} style={s.searchClear}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </PressableScale>
            )}
          </View>

          <View style={s.controlRow}>
            {/* Two options. A switch, not a menu — anything with two states
                that hides one of them is a menu pretending to be a switch. */}
            <View style={[s.segmented, { backgroundColor: colors.surfaceRaised }]}>
              {(['year', 'type'] as const).map((g) => (
                <PressableScale
                  key={g}
                  onPress={() => setGroupBy(g)}
                  style={[s.segment, groupBy === g && { backgroundColor: COLORS.primary }]}
                >
                  <Text
                    style={[
                      s.segmentText,
                      { color: groupBy === g ? '#fff' : colors.textSecondary },
                    ]}
                  >
                    {t(`documents.groupBy.${g}`)}
                  </Text>
                </PressableScale>
              ))}
            </View>

            {awaiting.length > 0 && (
              <PressableScale
                onPress={() => setOnlyWaiting((v) => !v)}
                style={[
                  s.waitingToggle,
                  {
                    borderColor: onlyWaiting ? COLORS.warning : colors.border,
                    backgroundColor: onlyWaiting ? colors.warningLight : 'transparent',
                  },
                ]}
              >
                <Ionicons
                  name="create-outline"
                  size={14}
                  color={onlyWaiting ? COLORS.warning : colors.textSecondary}
                />
                <Text style={[s.waitingToggleText, { color: colors.textPrimary }]}>
                  {awaiting.length}
                </Text>
              </PressableScale>
            )}
          </View>
        </View>

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
                <View style={s.sectionTitleRow}>
                  <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
                  {/*
                    The count moves here, where it belongs.

                    It was the one genuinely useful thing about the filter sheet
                    — how much is behind each choice — and a sticky section
                    header carries it without anybody opening anything.
                  */}
                  <Text style={[s.sectionCount, { color: colors.textMuted }]}>{section.count}</Text>
                </View>
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
  needed: {
    borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACING.md,
    marginHorizontal: SPACING.md, marginTop: SPACING.md, gap: SPACING.xs,
  },
  neededTitle: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.xs },
  neededRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
  neededBody: { flex: 1, minWidth: 0 },
  neededLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium },
  neededState: { fontSize: FONT_SIZE.sm },
  blockPill: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.full },
  blockPillText: { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.semibold },

  controls: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, gap: SPACING.sm },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm,
  },
  searchInput: { flex: 1, paddingVertical: SPACING.sm, fontSize: FONT_SIZE.md },
  searchClear: { padding: 2 },

  controlRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  segmented: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: RADIUS.full, flex: 1 },
  segment: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.xs, borderRadius: RADIUS.full,
  },
  segmentText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  waitingToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs,
  },
  waitingToggleText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    marginHorizontal: SPACING.md, marginTop: SPACING.md,
    padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1,
  },
  bannerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  bannerBody: { flex: 1, minWidth: 0 },
  bannerText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  bannerSub: { fontSize: FONT_SIZE.sm, marginTop: 1 },

  tab: {
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: RADIUS.full, borderWidth: StyleSheet.hairlineWidth,
  },
  tabSmall: { paddingVertical: 4, paddingHorizontal: SPACING.sm },
  tabText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },

  list: { paddingHorizontal: SPACING.md },

  // Sticky, so the year is always visible while scrolling twenty payslips.
  sectionHeader: { paddingTop: SPACING.md, paddingBottom: SPACING.xs, gap: SPACING.xs },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionCount: { fontSize: FONT_SIZE.xs, fontVariant: ['tabular-nums'] },
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
