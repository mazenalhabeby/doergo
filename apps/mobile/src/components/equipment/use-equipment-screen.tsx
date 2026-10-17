import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  normalizeKindShape,
  custodyDays,
  logTypesForKind,
  findLogType,
  kindMeters,
  COST_LOG_KEY,
  orgHasAddOn,
  formatMoney,
} from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { useResponsive } from '../../lib/responsive';
import { assetsApi, assetProposalsApi, type HeldAsset, type MyExpense, type DueItem } from '../../lib/api';
import { logTypeLabel } from '../../lib/log-display';
import { formatDay } from '../../lib/money';
import { sentIn, type QueuedSend, type SentItem } from '../../lib/sent-in';
import { forgetHeldAssets } from '../../hooks/use-held-assets';
import { knownEquipment, rememberEquipment, type EquipmentLoaded } from '../../lib/equipment-cache';
import { useSyncStatus } from '../../offline/offline-context';
import { STILL_MINE } from '../../offline/actions/outcome';
import { overlayMyLog, logEntriesDeliveredSince } from '../../offline/assets/log-overlay';
import { AText, PrimaryButton } from '../amazen';
import { centeredContent } from '../screen-container';
import { SectionLabel } from '../job/job-ui';

export type Loaded = EquipmentLoaded;

export const shapeOf = (h: HeldAsset) => normalizeKindShape(h.asset?.category?.config);

export const canSpendOn = (h: HeldAsset) => {
  const s = shapeOf(h);
  return s.money.enabled && s.money.categories.some((c) => c.direction === 'out');
};

/** The kind's entry types a member can choose — Cost first where the kind records money going out. */
export const typesFor = (h: HeldAsset) => logTypesForKind(shapeOf(h)).filter((ty) => ty.key !== COST_LOG_KEY || canSpendOn(h));

/** Open the right screen for one thing a member did. */
export function logFor(assetId: string, key: string) {
  if (key === COST_LOG_KEY) router.push({ pathname: '/(app)/asset-expense', params: { assetId } } as never);
  else router.push({ pathname: '/(app)/asset-log', params: { assetId, logType: key } } as never);
}

/** EquipmentScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useEquipmentScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;
  const lang = i18n.language;
  const money = useCallback((cents: number) => formatMoney(cents, 'EUR', lang), [lang]);
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
      const next: Loaded = {
        held: mine.periods,
        canPropose: mine.canPropose,
        expenses,
        proposals,
        entries: logged,
        due: dueSoon,
        at: Date.now(),
      };
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
    + operations.filter(
        (o) =>
          (o.op === 'expense.submit' || o.op === 'proposal.raise') &&
          o.state === 'done' &&
          o.updatedAt > (data?.at ?? 0),
      ).length;
  useEffect(() => {
    if ((data?.at ?? 0) > 0 && delivered > 0) void load();
  }, [delivered, load]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (d.unitsLeft !== null && d.unitsLeft <= 0)
        return t('logbook.overdueUnits', { amount: `${Math.abs(d.unitsLeft).toLocaleString(lang)}${unit}` });
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
        style={({ pressed }) => ({
          backgroundColor: c.well,
          borderRadius: amazen.radius.panel,
          padding: amazen.space(3.5),
          gap: amazen.space(3),
          opacity: pressed ? 0.9 : 1,
        })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3) }}>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              backgroundColor: c.accentTint,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Ionicons name="cube-outline" size={21} color={c.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 15.5 }}>
              {a?.name ?? t('myAssets.anAsset', 'An asset')}
            </AText>
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
            <View
              key={k}
              style={{
                flex: 1,
                backgroundColor: c.sunken,
                borderRadius: 14,
                paddingHorizontal: amazen.space(2.5),
                paddingVertical: amazen.space(2),
              }}>
              <SectionLabel>{k}</SectionLabel>
              <AText variant="body" tone="strong" numeric numberOfLines={1} style={{ fontSize: 14, marginTop: 2 }}>{v}</AText>
            </View>
          ))}
        </View>
        {label ? <PrimaryButton label={label} onPress={() => act(h)} /> : null}
      </Pressable>
    );
  };

  return {
    amazen,
    c,
    t,
    wide,
    money,
    day,
    data,
    stale,
    refreshing,
    opened,
    setOpened,
    picking,
    setPicking,
    takingBack,
    setTakingBack,
    busy,
    load,
    held,
    items,
    whatOf,
    stateWords,
    dueLine,
    act,
    actLabel,
    takeBack,
    fromSheet,
    back,
    offerContract,
    due,
    card,
  };
}
