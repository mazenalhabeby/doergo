import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  normalizeKindShape, custodyDays, logTypesForKind, findLogType, kindMeters, COST_LOG_KEY, orgHasAddOn,
} from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { useResponsive } from '../../lib/responsive';
import { assetsApi, assetProposalsApi, type HeldAsset, type MyExpense, type DueItem } from '../../lib/api';
import { logColor, logTypeLabel } from '../../lib/log-display';
import { formatDay, formatMoney } from '../../lib/money';
import { sentIn, canTakeBack, type QueuedSend, type SentItem } from '../../lib/sent-in';
import { forgetHeldAssets } from '../../hooks/use-held-assets';
import { knownEquipment, rememberEquipment, type EquipmentLoaded } from '../../lib/equipment-cache';
import { useSyncStatus } from '../../offline/offline-context';
import { STILL_MINE } from '../../offline/actions/outcome';
import { overlayMyLog, logEntriesDeliveredSince } from '../../offline/assets/log-overlay';
import { AText, Ground, HeaderBack, PrimaryButton, ScreenHeader, Well } from '../amazen';
import { centeredContent } from '../screen-container';
import { Banner, JobSheet, Pill, SectionLabel, SheetOption } from '../job/job-ui';

type Loaded = EquipmentLoaded;

const shapeOf = (h: HeldAsset) => normalizeKindShape(h.asset?.category?.config);
const canSpendOn = (h: HeldAsset) => { const s = shapeOf(h); return s.money.enabled && s.money.categories.some((c) => c.direction === 'out'); };
/** The kind's entry types a member can choose — Cost first where the kind records money going out. */
const typesFor = (h: HeldAsset) => logTypesForKind(shapeOf(h)).filter((ty) => ty.key !== COST_LOG_KEY || canSpendOn(h));

/** Open the right screen for one thing a member did. */
function logFor(assetId: string, key: string) {
  if (key === COST_LOG_KEY) router.push({ pathname: '/(app)/asset-expense', params: { assetId } } as never);
  else router.push({ pathname: '/(app)/asset-log', params: { assetId, logType: key } } as never);
}

/**
 * MY EQUIPMENT — what is due, what you hold, and what you sent in.
 *
 * Each card opens the thing itself (make, model, money in and out, what is
 * due, your last entries) — there was no page for one piece of equipment.
 * One button per card, the one that fits its kind: "Log something" for a kind
 * with a logbook, "Add a receipt" for one that only records money.
 */
export function EquipmentScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;
  const lang = i18n.language;
  const money = useCallback((cents: number) => formatMoney(cents, lang), [lang]);
  const day = useCallback((iso: string) => formatDay(iso, lang), [lang]);

  const cached = knownEquipment(user?.id);
  const [data, setData] = useState<Loaded | null>(cached);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [opened, setOpened] = useState<HeldAsset | null>(null);
  const [picking, setPicking] = useState<HeldAsset | null>(null);
  const [takingBack, setTakingBack] = useState<SentItem | null>(null);
  const [busy, setBusy] = useState(false);
  const { operations } = useSyncStatus();

  const load = useCallback(async (spinner = false) => {
    if (spinner) setRefreshing(true);
    try {
      const [mine, proposals, logged, dueSoon] = await Promise.all([
        assetsApi.mine(),
        assetProposalsApi.mine(),
        assetsApi.myLog().catch(() => null),
        assetsApi.dueMine().catch(() => [] as DueItem[]),
      ]);
      // Receipts on their own only on a server without the logbook — they are entries otherwise.
      const expenses = logged === null ? await assetsApi.myExpenses().catch(() => [] as MyExpense[]) : [];
      const next: Loaded = { held: mine.periods, canPropose: mine.canPropose, expenses, proposals, entries: logged, due: dueSoon, at: Date.now() };
      setData(next);
      setStale(false);
      if (user?.id) rememberEquipment(user.id, next);
      forgetHeldAssets(); // the profile's count reads the same answer
    } catch {
      setStale(true);
      setData((d) => d ?? { held: [], canPropose: false, expenses: [], proposals: [], entries: null, due: [], at: 0 });
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const held = data?.held ?? [];
  const byAsset = useMemo(() => new Map(held.map((h) => [h.assetId, h] as const)), [held]);
  const rows = useMemo(() => overlayMyLog(data?.entries ?? null, operations, held, data?.at ?? 0), [data, operations, held]);

  /* Delivered while this screen is open → re-read, so "Waiting to send" turns into the office's answer. */
  const delivered = logEntriesDeliveredSince(operations, data?.at ?? 0)
    + operations.filter((o) => (o.op === 'expense.submit' || o.op === 'proposal.raise') && o.state === 'done' && o.updatedAt > (data?.at ?? 0)).length;
  useEffect(() => { if ((data?.at ?? 0) > 0 && delivered > 0) void load(); }, [delivered, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const queued = useMemo<QueuedSend[]>(() => operations
    .filter((o) => (o.op === 'expense.submit' || o.op === 'proposal.raise') && STILL_MINE.has(o.state))
    .map((o) => ({ id: o.id, op: o.op, createdAt: o.createdAt, body: (o.payload.body ?? {}) as Record<string, unknown>, params: (o.payload as { params?: Record<string, unknown> }).params })), [operations]);

  const items = useMemo(() => sentIn({
    entries: rows,
    expenses: data?.expenses ?? [],
    proposals: data?.proposals ?? [],
    queued,
    nameOf: (id) => byAsset.get(id)?.asset?.name ?? null,
    unitOf: (assetId, _logType, field) => {
      const h = byAsset.get(assetId);
      return h ? kindMeters(shapeOf(h).logTypes).find((m) => m.key === field)?.unit ?? null : null;
    },
  }), [rows, data, queued, byAsset]);

  const whatOf = useCallback((i: SentItem) => {
    if (i.kind === 'contract') return t('equipment.contract', 'Contract');
    const h = i.assetId ? byAsset.get(i.assetId) : undefined;
    const ty = h ? findLogType(shapeOf(h), i.what) : null;
    return ty ? logTypeLabel(ty, t) : i.what || t('logbook.cost', 'Cost');
  }, [byAsset, t]);

  const stateWords = (i: SentItem) => ({
    toSend: t('offline.chip.waiting', 'Waiting to send'),
    office: t('equipment.state.office', 'Waiting for the office'),
    accepted: t('equipment.state.accepted', 'Accepted'),
    refused: t('equipment.state.refused', 'Refused'),
    takenBack: t('equipment.state.takenBack', 'Taken back'),
  })[i.state];

  const dueLine = (d: DueItem) => {
    const unit = d.unit ? ` ${d.unit}` : '';
    if (d.stage === 'overdue') {
      if (d.unitsLeft !== null && d.unitsLeft <= 0) return t('logbook.overdueUnits', { amount: `${Math.abs(d.unitsLeft).toLocaleString(lang)}${unit}` });
      if (d.daysLeft !== null) return t('logbook.overdueDays', { count: Math.abs(d.daysLeft) });
      return t('logbook.overdue', 'Overdue');
    }
    const parts = [
      d.daysLeft !== null ? t('logbook.inDays', { count: d.daysLeft }) : null,
      d.unitsLeft !== null ? t('logbook.inUnits', { amount: `${d.unitsLeft.toLocaleString(lang)}${unit}` }) : null,
    ].filter(Boolean);
    return parts.length ? parts.join(` ${t('logbook.or', 'or')} `) : t('logbook.soon', 'Soon');
  };

  /* One button per card — the one that fits its kind. A kind with one entry type skips the choice. */
  const act = (h: HeldAsset) => {
    const types = typesFor(h);
    if (types.length === 1) { logFor(h.assetId, types[0]!.key); return; }
    if (types.length > 1) { setPicking(h); return; }
    if (canSpendOn(h)) logFor(h.assetId, COST_LOG_KEY);
  };
  const actLabel = (h: HeldAsset) => (shapeOf(h).logTypes.length > 0 ? t('equipment.logSomething', 'Log something') : canSpendOn(h) ? t('myAssets.addExpense', 'Add a receipt') : null);

  const takeBack = async () => {
    const i = takingBack;
    if (!i?.id) return;
    setBusy(true);
    try {
      if (i.kind === 'contract') await assetProposalsApi.withdraw(i.id);
      else if (i.assetId) await assetsApi.withdrawLog(i.assetId, i.id);
      setTakingBack(null);
      toast.success(t('logbook.withdrawn', 'Taken back'));
      void load();
    } catch (e) {
      toast.error((e as Error)?.message || t('logbook.withdrawFailed', 'Could not take it back'));
    } finally {
      setBusy(false);
    }
  };

  /* From one sheet to the next only after the first has left — two at once freeze iOS. */
  const fromSheet = (fn: () => void) => { setOpened(null); setTimeout(fn, 280); };
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)' as Href));
  const offerContract = !!data?.canPropose && !orgHasAddOn(user?.orgAddOns ?? null, 'documents');
  const due = data?.due ?? [];

  const card = (h: HeldAsset) => {
    const a = h.asset;
    const sub = [a?.category?.name, [a?.manufacturer, a?.model].filter(Boolean).join(' '), a?.serialNumber].filter(Boolean).join(' · ');
    const label = actLabel(h);
    return (
      <Pressable key={h.id} onPress={() => setOpened(h)} accessibilityRole="button" accessibilityLabel={a?.name}
        style={({ pressed }) => ({ backgroundColor: c.well, borderRadius: amazen.radius.panel, padding: amazen.space(3.5), gap: amazen.space(3), opacity: pressed ? 0.9 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3) }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="cube-outline" size={21} color={c.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 15.5 }}>{a?.name ?? t('myAssets.anAsset', 'An asset')}</AText>
            <AText variant="caption" tone="muted" numberOfLines={1}>{sub || '—'}</AText>
          </View>
          <AText variant="body" tone="muted">›</AText>
        </View>
        <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
          {[
            [t('myAssets.since', 'Since'), day(h.startedAt)],
            [t('equipment.held', 'Held'), t('custody.days', { count: custodyDays(h as never) })],
            [t('equipment.cost', 'Cost'), money(h.totals.outCents)],
          ].map(([k, v]) => (
            <View key={k} style={{ flex: 1, backgroundColor: c.sunken, borderRadius: 14, paddingHorizontal: amazen.space(2.5), paddingVertical: amazen.space(2) }}>
              <SectionLabel>{k}</SectionLabel>
              <AText variant="body" tone="strong" numeric numberOfLines={1} style={{ fontSize: 14, marginTop: 2 }}>{v}</AText>
            </View>
          ))}
        </View>
        {label ? <PrimaryButton label={label} onPress={() => act(h)} /> : null}
      </Pressable>
    );
  };

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={t('myAssets.title', 'My equipment')} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12), gap: amazen.space(3) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={c.accent} colors={[c.accent]} />}
      >
        {stale ? <Banner tone="warn" text={t('equipment.stale', 'Could not load just now — this is what the app last knew.')} action={{ label: t('common.retry', 'Try again'), onPress: () => void load(true) }} /> : null}

        {data === null ? (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(8) }}>{t('common.loading', 'Loading…')}</AText>
        ) : null}

        {due.length > 0 ? (
          <>
            <SectionLabel tone="warn" style={{ paddingHorizontal: amazen.space(1) }}>{`${t('logbook.dueSoon', 'Due soon')} · ${due.length}`}</SectionLabel>
            <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
              {due.map((d, i) => {
                const late = d.stage === 'overdue';
                return (
                  <Pressable key={`${d.assetId}:${d.key}`} onPress={() => logFor(d.assetId, d.key)} accessibilityRole="button"
                    style={({ pressed }) => ({ paddingVertical: amazen.space(3), borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell, gap: 6, opacity: pressed ? 0.75 : 1 })}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{`${d.assetName} · ${d.label}`}</AText>
                        <AText variant="caption" numberOfLines={1} style={{ color: late ? c.critical : c.warn }}>{dueLine(d)}</AText>
                      </View>
                      <AText variant="body" tone="muted">›</AText>
                    </View>
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: c.tile, overflow: 'hidden' }}>
                      <View style={{ width: `${Math.min(100, Math.max(4, Math.round(d.progress * 100)))}%`, height: '100%', borderRadius: 3, backgroundColor: late ? c.critical : c.warn }} />
                    </View>
                  </Pressable>
                );
              })}
            </Well>
          </>
        ) : null}

        {data && held.length === 0 && !stale ? (
          <View style={{ alignItems: 'center', paddingVertical: amazen.space(8), gap: amazen.space(2) }}>
            <Ionicons name="cube-outline" size={36} color={c.inkOnGlass} />
            <AText variant="body" tone="onGlass" style={{ textAlign: 'center' }}>{t('myAssets.empty', 'No equipment has been handed to you yet.')}</AText>
          </View>
        ) : null}
        {held.length > 0 ? <SectionLabel style={{ paddingHorizontal: amazen.space(1) }}>{`${t('equipment.youHold', 'You hold')} · ${held.length}`}</SectionLabel> : null}
        {held.map(card)}

        {offerContract ? (
          <SheetOption label={t('documents.supply.contract', 'Contract for a vehicle or equipment')} hint={t('documents.supply.contractHint')} onPress={() => router.push('/(app)/send-document' as never)} />
        ) : null}

        {items.length > 0 ? (
          <>
            <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>{`${t('equipment.sentIn', 'Sent in')} · ${items.length}`}</SectionLabel>
            <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
              {items.map((i, n) => {
                const tone = i.state === 'toSend' || i.state === 'office' ? c.warn : i.state === 'refused' ? c.critical : i.state === 'accepted' ? c.accent : c.inkMuted;
                const lead = [day(i.at), i.reading].filter(Boolean).join(' · ');
                return (
                  <View key={i.key} style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.75), borderTopWidth: n === 0 ? 0 : 1, borderTopColor: c.lineWell }}>
                    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={i.kind === 'contract' ? 'document-text-outline' : i.state === 'toSend' ? 'cloud-upload-outline' : 'receipt-outline'} size={16} color={c.ink} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14 }}>{[whatOf(i), i.about].filter(Boolean).join(' · ')}</AText>
                      <AText variant="caption" numberOfLines={2} style={{ color: c.inkMuted }}>
                        {`${lead} · `}
                        <AText variant="caption" style={{ color: tone }}>{stateWords(i)}</AText>
                        {i.reason ? <AText variant="caption" tone="muted">{` — “${i.reason}”`}</AText> : null}
                      </AText>
                      {canTakeBack(i) ? (
                        <Pressable onPress={() => setTakingBack(i)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                          <AText variant="caption" style={{ color: c.critical }}>{t('logbook.withdraw', 'Take back')}</AText>
                        </Pressable>
                      ) : null}
                    </View>
                    {i.amountCents ? (
                      <AText numeric style={{ fontSize: 14, color: i.state === 'refused' || i.state === 'takenBack' ? c.inkMuted : i.direction === 'IN' ? c.accent : c.inkStrong }}>
                        {`${i.direction === 'IN' ? '+' : ''}${money(i.amountCents)}`}
                      </AText>
                    ) : null}
                  </View>
                );
              })}
            </Well>
          </>
        ) : null}
      </ScrollView>

      {/* ---------- one piece of equipment ---------- */}
      <JobSheet visible={!!opened} onClose={() => setOpened(null)} title={opened?.asset?.name} eyebrow={opened?.asset?.category?.name ? <SectionLabel>{opened.asset.category.name}</SectionLabel> : undefined}>
        {opened ? (() => {
          const a = opened.asset;
          const facts: [string, string][] = [];
          const mm = [a?.manufacturer, a?.model].filter(Boolean).join(' · ');
          if (mm) facts.push([t('equipment.makeModel', 'Make · model'), mm]);
          if (a?.serialNumber) facts.push([t('equipment.serial', 'Serial'), a.serialNumber]);
          facts.push([t('equipment.withYouSince', 'With you since'), `${day(opened.startedAt)} · ${t('custody.days', { count: custodyDays(opened as never) })}`]);
          const mineDue = due.filter((d) => d.assetId === opened.assetId);
          const mineItems = items.filter((i) => i.assetId === opened.assetId).slice(0, 4);
          const label = actLabel(opened);
          return (
            <>
              <View style={{ backgroundColor: c.sunken, borderRadius: 18, paddingHorizontal: amazen.space(3.5) }}>
                {facts.map(([k, v], i) => <Fact key={k} first={i === 0} label={k} value={v} />)}
              </View>
              <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
                {[
                  [t('equipment.out', 'Out'), money(opened.totals.outCents), c.inkStrong],
                  [t('equipment.in', 'In'), money(opened.totals.inCents), opened.totals.inCents ? c.accent : c.inkStrong],
                  [t('equipment.entries', 'Entries'), String(opened.totals.entries), c.inkStrong],
                ].map(([k, v, col]) => (
                  <View key={k} style={{ flex: 1, backgroundColor: c.sunken, borderRadius: 14, padding: amazen.space(2.5) }}>
                    <SectionLabel>{k}</SectionLabel>
                    <AText numeric numberOfLines={1} style={{ fontSize: 14, marginTop: 2, color: col }}>{v}</AText>
                  </View>
                ))}
              </View>
              {mineDue.length ? (
                <>
                  <SectionLabel tone="warn">{t('equipment.due', 'Due')}</SectionLabel>
                  <View style={{ backgroundColor: c.sunken, borderRadius: 18, paddingHorizontal: amazen.space(3.5) }}>
                    {mineDue.map((d, i) => <Fact key={d.key} first={i === 0} label={d.label} value={dueLine(d)} tone={d.stage === 'overdue' ? 'critical' : 'warn'} onPress={() => fromSheet(() => logFor(d.assetId, d.key))} />)}
                  </View>
                </>
              ) : null}
              {mineItems.length ? (
                <>
                  <SectionLabel>{t('equipment.lastEntries', 'Your last entries')}</SectionLabel>
                  <View style={{ backgroundColor: c.sunken, borderRadius: 18, paddingHorizontal: amazen.space(3.5) }}>
                    {mineItems.map((i, n) => <Fact key={i.key} first={n === 0} label={`${whatOf(i)} · ${day(i.at)}`} value={i.reading ?? (i.amountCents ? money(i.amountCents) : stateWords(i))} />)}
                  </View>
                </>
              ) : null}
              {label ? <PrimaryButton label={label} onPress={() => { const h = opened; fromSheet(() => act(h)); }} /> : null}
            </>
          );
        })() : null}
      </JobSheet>

      {/* ---------- what did you do? ---------- */}
      <JobSheet visible={!!picking} onClose={() => setPicking(null)} title={t('logbook.whatDidYouDo', 'What did you do?')} eyebrow={picking?.asset?.name ? <SectionLabel>{picking.asset.name}</SectionLabel> : undefined}>
        {picking ? typesFor(picking).map((ty) => (
          <Pressable key={ty.key} onPress={() => { const h = picking; setPicking(null); setTimeout(() => logFor(h.assetId, ty.key), 280); }} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), borderRadius: 16, paddingHorizontal: amazen.space(3.5), paddingVertical: amazen.space(3), backgroundColor: c.tile, opacity: pressed ? 0.8 : 1 })}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: logColor(ty.color) }} />
            <AText variant="body" tone="strong" style={{ flex: 1, fontSize: 14.5 }}>{logTypeLabel(ty, t)}</AText>
            {due.some((d) => d.assetId === picking.assetId && d.key === ty.key) ? <Pill label={t('equipment.due', 'Due')} tone="warn" /> : null}
            <AText variant="body" tone="muted">›</AText>
          </Pressable>
        )) : null}
      </JobSheet>

      {/* ---------- take it back? ---------- */}
      <JobSheet visible={!!takingBack} onClose={() => setTakingBack(null)} busy={busy} title={t('equipment.takeBackTitle', 'Take it back?')}>
        {takingBack ? (
          <>
            <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>
              {[whatOf(takingBack), takingBack.about, takingBack.amountCents ? money(takingBack.amountCents) : null].filter(Boolean).join(' · ')}
              {'. '}{t('equipment.takeBackBody', 'Nobody will review it.')}
            </AText>
            <PrimaryButton label={t('equipment.keepIt', 'Keep it')} onPress={() => setTakingBack(null)} />
            <SheetOption label={t('logbook.withdraw', 'Take back')} tone="critical" disabled={busy} onPress={() => void takeBack()} />
          </>
        ) : null}
      </JobSheet>
    </Ground>
  );
}

function Fact({ label, value, first, tone, onPress }: { label: string; value: string; first?: boolean; tone?: 'warn' | 'critical'; onPress?: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const body = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: amazen.space(2.75), borderTopWidth: first ? 0 : 1, borderTopColor: c.lineWell }}>
      <AText variant="body" tone="muted" numberOfLines={1} style={{ fontSize: 13.5, flexShrink: 1 }}>{label}</AText>
      <AText variant="body" numeric style={{ fontSize: 13.5, textAlign: 'right', color: tone === 'critical' ? c.critical : tone === 'warn' ? c.warn : c.inkStrong }}>{`${value}${onPress ? '  ›' : ''}`}</AText>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}
