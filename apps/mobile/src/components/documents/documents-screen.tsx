import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useResponsive } from '../../lib/responsive';
import { useHeldAssets } from '../../hooks/use-held-assets';
import { documentsApi, type DocumentType, type MemberDocument } from '../../lib/api';
import { useDocumentRequirements } from '../../contexts/document-requirements-context';
import { useSyncStatus } from '../../offline/offline-context';
import { STILL_MINE } from '../../offline/actions/outcome';
import { stillNeeded, type AskRequirement, type AskedRow } from '../../lib/document-asks';
import { AText, FilterPill, FilterRow, Ground, HeaderBack, PrimaryButton, ScreenHeader, SearchField, Well } from '../amazen';
import { centeredContent } from '../screen-container';
import { JobSheet, Pill, SectionLabel, SheetOption } from '../job/job-ui';
import { SupplyDocumentSheet } from '../supply-document-sheet';
import { DocumentRow, dayOf, useDocumentTag, usePeriod } from './document-row';
import { httpsUrl, openSafeUrl } from '../../lib/safe-links';

type Section = { key: string; title: string; data: MemberDocument[]; tone?: 'warn' };
type Queued = { id: string; title: string; typeId: string };

const yearOf = (d: MemberDocument) => d.periodYear ?? new Date(d.issuedAt).getFullYear();

/**
 * MY DOCUMENTS — what is asked of the member, what waits on their signature,
 * and their whole file by year.
 *
 * ⚠️ No row carries a link. One is minted when "Open the file" is tapped, and
 * that mint is what records the document as opened — a list that pre-fetched
 * links would make the delivery evidence meaningless.
 *
 * The signing screen is not this file's: a document waiting on a signature
 * goes there exactly as before.
 */
export function DocumentsScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;
  const { open: openFromNotification } = useLocalSearchParams<{ open?: string }>();
  const { refresh: refreshRequirements } = useDocumentRequirements();
  const { canPropose } = useHeldAssets();
  const { operations } = useSyncStatus();
  const tagOf = useDocumentTag();
  const periodOf = usePeriod();

  const [documents, setDocuments] = useState<MemberDocument[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [requirements, setRequirements] = useState<AskRequirement[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [picker, setPicker] = useState<'type' | 'year' | null>(null);
  const [opened, setOpened] = useState<MemberDocument | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [supply, setSupply] = useState<{ typeId: string | null } | null>(null);

  const load = useCallback(async (mode: 'first' | 'refresh' | 'quiet' = 'quiet') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const [docs, tys, reqs] = await Promise.all([
        documentsApi.list(),
        documentsApi.listTypes(),
        documentsApi.requirements().catch(() => [] as AskRequirement[]),
      ]);
      setDocuments(docs);
      setTypes(tys);
      setRequirements(reqs);
      setState('ready');
    } catch {
      // ⚠️ A failed load is not an empty file. It used to say "Nothing here yet".
      setState((s) => (s === 'ready' ? s : 'failed'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  /*
    Every return to this screen re-reads — and moves the home strip and badges
    with it. Coming back from signing is exactly when they stop being true, and
    they used to trail for up to a minute.
  */
  useFocusEffect(useCallback(() => {
    void load();
    void refreshRequirements({ force: true });
  }, [load, refreshRequirements]));

  /* Sent with no signal and still on this phone — shown, not hidden until it has gone. */
  const queued = useMemo<Queued[]>(() => operations
    .filter((o) => o.op === 'document.supply' && STILL_MINE.has(o.state))
    .map((o) => {
      const b = (o.payload.body ?? {}) as { title?: string; typeId?: string };
      return { id: o.id, title: b.title ?? '', typeId: b.typeId ?? '' };
    }), [operations]);
  const queuedTypeIds = useMemo(() => new Set(queued.map((q) => q.typeId)), [queued]);
  const need = useMemo(() => stillNeeded(requirements, documents, queuedTypeIds), [requirements, documents, queuedTypeIds]);

  const canAdd = types.some((ty) => ty.direction !== 'ISSUED' && ty.isActive) || canPropose;
  const onPaperOf = useCallback((d: MemberDocument) => types.find((ty) => ty.id === d.typeId)?.signatureMode === 'WET_INK', [types]);

  /* One box across the title, the type and the year — whichever the half-remembered word belongs to. */
  const matches = useCallback((d: MemberDocument, f: { typeId: string | null; year: number | null }, q: string) => {
    if (f.typeId && d.typeId !== f.typeId) return false;
    if (f.year !== null && yearOf(d) !== f.year) return false;
    if (!q) return true;
    return d.title.toLowerCase().includes(q) || d.typeLabel.toLowerCase().includes(q) || String(yearOf(d)).includes(q);
  }, []);
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => documents.filter((d) => matches(d, { typeId, year }, q)), [documents, typeId, year, q, matches]);

  /* Waiting on a signature is ONE section at the top — it was also a banner and a filter pill. */
  const sections = useMemo<Section[]>(() => {
    const waiting = visible.filter((d) => d.needsSignature);
    const byYear = new Map<number, MemberDocument[]>();
    for (const d of visible) {
      if (d.needsSignature) continue;
      const y = yearOf(d);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(d);
    }
    const out: Section[] = [];
    if (waiting.length) out.push({ key: 'waiting', title: t('documents.sectionSign', { count: waiting.length, defaultValue: 'Waiting for your signature · {{count}}' }), data: waiting, tone: 'warn' });
    for (const y of [...byYear.keys()].sort((a, b) => b - a)) out.push({ key: String(y), title: `${y} · ${byYear.get(y)!.length}`, data: byYear.get(y)! });
    return out;
  }, [visible, t]);

  const years = useMemo(() => [...new Set(documents.map(yearOf))].sort((a, b) => b - a), [documents]);
  const usedTypes = useMemo(() => { const ids = new Set(documents.map((d) => d.typeId)); return types.filter((ty) => ids.has(ty.id)); }, [types, documents]);

  /* ---------- acts ---------- */
  const openFile = useCallback(async (d: MemberDocument) => {
    setOpening(d.id);
    try {
      const res = await documentsApi.downloadUrl(d.id);
      if (!res?.url) throw new Error(t('documents.openFailed'));
      // A signed link from our server — https only, never another scheme.
      if (!(await openSafeUrl(httpsUrl(res.url)))) throw new Error(t('documents.openFailed'));
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('documents.openFailed'));
    } finally {
      setOpening(null);
    }
  }, [load, t, toast]);

  const tapDocument = useCallback((d: MemberDocument) => {
    if (d.needsSignature) {
      // Only the id: the signing screen reads the title and the mode from the server.
      router.push({ pathname: '/sign-document', params: { id: d.id } } as never);
      return;
    }
    setOpened(d);
  }, []);

  /* Arrived from a notification about one document: waiting on a signature → sign; otherwise show it. */
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!openFromNotification || state !== 'ready' || handled.current === openFromNotification) return;
    handled.current = openFromNotification;
    const d = documents.find((x) => x.id === openFromNotification);
    if (d) tapDocument(d);
  }, [openFromNotification, state, documents, tapDocument]);

  /* From one sheet to another only after the first has left — two modals at once freeze iOS. */
  const sendNew = (typeIdToSend: string) => { setOpened(null); setTimeout(() => setSupply({ typeId: typeIdToSend }), 280); };

  const askedLine = (row: AskedRow) => (
    row.why === 'sentBack' ? (row.reason ? t('documents.supply.sentBackWhy', { reason: row.reason }) : t('documents.required.state.REJECTED'))
      : row.why === 'expired' ? t('documents.required.state.EXPIRED')
      : row.why === 'expiring' ? (row.expiresOn ? t('documents.supply.expiringOn', { date: dayOf(row.expiresOn) }) : t('documents.required.state.EXPIRING'))
      : t('documents.required.state.MISSING')
  );

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)' as Href));
  const filtered = !!q || !!typeId || year !== null;

  /* ---------- the top of the list ---------- */
  const neededCount = need.asked.length + need.checking.length;
  const header = (
    <View style={{ gap: amazen.space(3), paddingBottom: amazen.space(1) }}>
      {neededCount > 0 ? (
        <View style={{ backgroundColor: c.warnTint, borderRadius: amazen.radius.panel, paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(1.5) }}>
          <SectionLabel tone="warn" style={{ paddingTop: amazen.space(2), paddingBottom: amazen.space(1) }}>{`${t('documents.required.title')} · ${neededCount}`}</SectionLabel>
          {need.asked.map((row, i) => (
            <Pressable key={row.typeId} onPress={() => setSupply({ typeId: row.typeId })} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.5), borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell, opacity: pressed ? 0.75 : 1 })}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: row.why === 'sentBack' || row.why === 'expired' ? c.criticalTint : c.warnTint, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={row.why === 'sentBack' ? 'refresh' : 'add'} size={18} color={row.why === 'sentBack' || row.why === 'expired' ? c.critical : c.warn} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AText variant="body" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14.5 }}>{row.label}</AText>
                  {row.blocksWork ? <Pill label={t('documents.required.blocksWork')} tone="critical" /> : null}
                </View>
                <AText variant="caption" numberOfLines={2} style={{ color: row.why === 'sentBack' || row.why === 'expired' ? c.critical : c.inkMuted }}>{askedLine(row)}</AText>
              </View>
              <AText variant="body" tone="muted">›</AText>
            </Pressable>
          ))}
          {/* Sent, and not yet decided: shown, not offered again. Approved → gone. */}
          {need.checking.map((row, i) => (
            <View key={row.typeId} style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.5), borderTopWidth: i === 0 && need.asked.length === 0 ? 0 : 1, borderTopColor: c.lineWell, opacity: 0.8 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="time-outline" size={17} color={c.accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{row.label}</AText>
                <AText variant="caption" tone="muted" numberOfLines={1}>
                  {row.onPhone ? t('documents.supply.onPhone', 'On this phone · sends when you are online') : t('documents.supply.checking', 'Sent · the office is checking it')}
                </AText>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {queued.length > 0 ? (
        <>
          <SectionLabel tone="warn" style={{ paddingHorizontal: amazen.space(1) }}>{t('documents.waitingToSend', { count: queued.length, defaultValue: 'Waiting to send · {{count}}' })}</SectionLabel>
          <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
            {queued.map((qd, i) => (
              <View key={qd.id} style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.75), borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="cloud-upload-outline" size={18} color={c.ink} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{qd.title}</AText>
                  <AText variant="caption" tone="muted" numberOfLines={1}>{t('documents.queuedLine', 'Added with no signal · sends when you are online')}</AText>
                </View>
                <Pill label={t('offline.chip.waiting')} tone="warn" />
              </View>
            ))}
          </Well>
        </>
      ) : null}

      <SearchField value={query} onChangeText={setQuery} placeholder={t('documents.searchPlaceholder')} />
      {usedTypes.length > 1 || years.length > 1 ? (
        <FilterRow>
          {usedTypes.length > 1 ? (
            <FilterPill label={`${typeId ? usedTypes.find((ty) => ty.id === typeId)?.label ?? '' : t('documents.filter.anyType')} ▾`} on={!!typeId} onPress={() => setPicker('type')} />
          ) : null}
          {years.length > 1 ? <FilterPill label={`${year ?? t('documents.filter.anyYear')} ▾`} on={year !== null} onPress={() => setPicker('year')} /> : null}
          {typeId || year !== null ? <FilterPill label={`✕ ${t('documents.clearFilters', 'Clear')}`} on={false} onPress={() => { setTypeId(null); setYear(null); }} /> : null}
        </FilterRow>
      ) : null}
    </View>
  );

  const countFor = (patch: { typeId?: string | null; year?: number | null }) =>
    documents.filter((d) => matches(d, { typeId: 'typeId' in patch ? patch.typeId! : typeId, year: 'year' in patch ? patch.year! : year }, q)).length;

  const tag = opened ? tagOf(opened) : null;

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('profile.documents', 'Documents')}
        leading={<HeaderBack onPress={back} />}
        actions={canAdd ? [{ label: `＋ ${t('documents.add', 'Add')}`, a11yLabel: t('documents.supply.action'), onPress: () => setSupply({ typeId: null }) }] : undefined}
        style={wide ?? undefined}
      />
      <SectionList
        sections={state === 'ready' ? sections : []}
        keyExtractor={(d) => d.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={c.accent} colors={[c.accent]} />}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <SectionLabel tone={section.tone} style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(4), paddingBottom: amazen.space(2) }}>{section.title}</SectionLabel>
        )}
        renderItem={({ item, index, section }) => {
          const r0 = amazen.radius.panel;
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <View style={{
              backgroundColor: c.well, paddingHorizontal: amazen.space(3.5),
              borderTopLeftRadius: first ? r0 : 0, borderTopRightRadius: first ? r0 : 0,
              borderBottomLeftRadius: last ? r0 : 0, borderBottomRightRadius: last ? r0 : 0,
            }}>
              <DocumentRow doc={item} first={first} onPaper={onPaperOf(item)} busy={opening === item.id} onPress={tapDocument} />
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: amazen.space(8), gap: amazen.space(2) }}>
            {state === 'loading' ? (
              <AText variant="caption" tone="onGlass">{t('common.loading', 'Loading…')}</AText>
            ) : state === 'failed' ? (
              <>
                <AText variant="body" tone="onGlass">{t('documents.loadFailed')}</AText>
                <PrimaryButton label={t('common.retry', 'Try again')} onPress={() => { setState('loading'); void load(); }} style={{ alignSelf: 'stretch', marginTop: amazen.space(2) }} />
              </>
            ) : (
              <>
                <AText variant="body" tone="strong">{filtered ? t('documents.noMatches') : t('documents.my.empty')}</AText>
                <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>{filtered ? t('documents.noMatchesHint') : t('documents.my.emptyHint')}</AText>
              </>
            )}
          </View>
        }
      />

      {/* ---------- a document, opened ---------- */}
      <JobSheet visible={!!opened} onClose={() => setOpened(null)} title={opened?.title}>
        {opened ? (
          <>
            <View style={{ backgroundColor: c.sunken, borderRadius: 18, paddingHorizontal: amazen.space(3.5) }}>
              <Fact first label={t('documents.fact.kind', 'Kind')} value={opened.typeLabel} />
              <Fact label={opened.status === 'PENDING_VERIFICATION' || opened.status === 'REJECTED' ? t('documents.fact.sentIn', 'Sent in') : t('documents.fact.issued', 'Issued')} value={dayOf(opened.issuedAt)} />
              {opened.periodMonth || opened.periodYear ? <Fact label={t('documents.fact.period', 'For')} value={periodOf(opened)} /> : null}
              {opened.expiresOn ? <Fact label={t('documents.fact.validUntil', 'Valid until')} value={dayOf(opened.expiresOn)} /> : null}
              {tag ? <Fact label={t('documents.fact.state', 'State')} value={tag.label} tone={tag.tone} /> : null}
            </View>
            {opened.status === 'REJECTED' && opened.rejectionReason ? (
              <View style={{ backgroundColor: c.criticalTint, borderRadius: 16, padding: amazen.space(3.5) }}>
                <AText variant="body" style={{ color: c.critical, fontSize: 13.5, lineHeight: 19 }}>{`“${opened.rejectionReason}”`}</AText>
              </View>
            ) : null}
            {onPaperOf(opened) ? <AText variant="caption" tone="muted">{t('documents.onPaperHint', 'Sign a printed copy and hand it back to the office.')}</AText> : null}
            <PrimaryButton label={t('documents.openTheFile', 'Open the file')} loading={opening === opened.id} onPress={() => void openFile(opened)} />
            {opened.status === 'REJECTED' || opened.standing === 'EXPIRED' || opened.standing === 'EXPIRING' ? (
              <SheetOption label={t('documents.sendNew', 'Send a new one')} tone="accent" onPress={() => sendNew(opened.typeId)} />
            ) : null}
          </>
        ) : null}
      </JobSheet>

      {/* ---------- filter pickers ---------- */}
      <JobSheet visible={!!picker} onClose={() => setPicker(null)} title={picker === 'year' ? t('documents.filter.year') : t('documents.filter.type')}>
        {picker === 'type' ? (
          <>
            <SheetOption label={`${t('documents.filter.anyType')} · ${countFor({ typeId: null })}`} tone={typeId ? 'strong' : 'accent'} onPress={() => { setTypeId(null); setPicker(null); }} />
            {usedTypes.map((ty) => (
              <SheetOption key={ty.id} label={`${ty.label} · ${countFor({ typeId: ty.id })}`} tone={typeId === ty.id ? 'accent' : 'strong'} onPress={() => { setTypeId(ty.id); setPicker(null); }} />
            ))}
          </>
        ) : picker === 'year' ? (
          <>
            <SheetOption label={`${t('documents.filter.anyYear')} · ${countFor({ year: null })}`} tone={year === null ? 'accent' : 'strong'} onPress={() => { setYear(null); setPicker(null); }} />
            {years.map((y) => (
              <SheetOption key={y} label={`${y} · ${countFor({ year: y })}`} tone={year === y ? 'accent' : 'strong'} onPress={() => { setYear(y); setPicker(null); }} />
            ))}
          </>
        ) : null}
      </JobSheet>

      <SupplyDocumentSheet
        types={types}
        visible={!!supply}
        initialTypeId={supply?.typeId ?? null}
        requirements={requirements}
        documents={documents}
        onClose={() => setSupply(null)}
        /* The badge and the home strip read a cached count — supplying is exactly when it stops being true. */
        onSubmitted={() => { void load(); void refreshRequirements({ force: true }); }}
        onContract={canPropose ? () => {
          setSupply(null);
          setTimeout(() => router.push('/(app)/send-document' as never), 280);
        } : undefined}
      />
    </Ground>
  );
}

function Fact({ label, value, first, tone }: { label: string; value: string; first?: boolean; tone?: 'accent' | 'warn' | 'critical' | 'neutral' }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const color = tone === 'accent' ? c.accent : tone === 'warn' ? c.warn : tone === 'critical' ? c.critical : c.inkStrong;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: amazen.space(2.75), borderTopWidth: first ? 0 : 1, borderTopColor: c.lineWell }}>
      <AText variant="body" tone="muted" style={{ fontSize: 13.5 }}>{label}</AText>
      <AText variant="body" style={{ fontSize: 13.5, color, flexShrink: 1, textAlign: 'right' }}>{value}</AText>
    </View>
  );
}
