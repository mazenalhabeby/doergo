import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useResponsive } from '../../lib/responsive';
import { formatTimeOfDay } from '../../lib/utils';
import { refusalInterpolation } from '../../lib/distance';
import { useConnectivity, useOffline, useSyncStatus } from '../../offline/offline-context';
import type { OutboxOp } from '../../offline/outbox/types';
import { AText, Ground, HeaderBack, PrimaryButton, ScreenHeader, Well } from '../amazen';
import { centeredContent } from '../screen-container';
import { Pill, SectionLabel } from '../job/job-ui';
import { SwitchRow } from './settings-ui';

const DAY_MS = 24 * 60 * 60 * 1000;
const STORAGE_WARN_BYTES = 500 * 1024 * 1024;
const STORAGE_URGENT_BYTES = 1024 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * SYNC — "is my work on the server?", answered in the first line.
 *
 * Then what needs the member (retry or let go, with the reason), what is
 * simply waiting, what went today, and this phone's own settings. "Sync now"
 * sits under the answer; it used to be at the very bottom, under the storage
 * figures, where nobody who needed it looked.
 */
export function SyncPage() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { user } = useAuth();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(640) : null;
  const { running: engine, files, media, preferences, unavailableReason, unavailableDetail } = useOffline();
  const available = !!engine;
  const connectivity = useConnectivity();
  const online = connectivity === 'online';
  const { snapshot, operations } = useSyncStatus();
  const [refreshing, setRefreshing] = useState(false);
  const hour12 = user?.timeFormat === '12h';
  const appVersion = Constants.expoConfig?.version ?? '?';
  /* Which JavaScript is running — an update not yet applied looks exactly like one that did not work. */
  const jsBuild = Updates.isEmbeddedLaunch ? 'embedded' : (Updates.updateId ?? 'unknown').slice(0, 8);

  const groups = useMemo(() => {
    const since = Date.now() - DAY_MS;
    return {
      attention: operations.filter((o) => o.state === 'conflict' || o.state === 'failed'),
      waiting: operations.filter((o) => ['pending', 'inflight', 'retry', 'awaiting_auth'].includes(o.state)),
      sent: operations.filter((o) => o.state === 'done' && o.updatedAt >= since).reverse(),
    };
  }, [operations]);

  const [wifiOnly, setWifiOnly] = useState(preferences?.current.photosOnWifiOnly ?? false);
  const [storage, setStorage] = useState({ waitingCount: 0, waitingBytes: 0, keptBytes: 0 });
  useEffect(() => preferences?.subscribe((p) => setWifiOnly(p.photosOnWifiOnly)), [preferences]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const held = (await files?.totals().catch(() => null)) ?? { count: 0, bytes: 0 };
      if (live) setStorage({ waitingCount: held.count, waitingBytes: held.bytes, keptBytes: media?.sizeBytes() ?? 0 });
    })();
    return () => { live = false; };
  }, [files, media, operations]);

  const refresh = useCallback(async () => {
    if (!engine) return;
    setRefreshing(true);
    try { await engine.syncAll(); } finally { setRefreshing(false); }
  }, [engine]);

  const label = (o: OutboxOp) => t(`offline.ops.${o.op.replace(/\./g, '_')}`, { defaultValue: o.op });
  const reason = (o: OutboxOp) => {
    const code = o.lastError?.code;
    if (code) {
      const known = t(`offline.errors.${code}`, { defaultValue: '', ...refusalInterpolation(o.lastError?.params) });
      if (known) return known;
    }
    if (o.state === 'conflict') return t('offline.errors.CONFLICT');
    return o.lastError?.message || t('offline.errors.default');
  };
  const time = (ms: number) => formatTimeOfDay(ms, hour12);

  /* The answer, in one line. */
  const need = groups.attention.length;
  const waiting = groups.waiting.length;
  const head = need
    ? { tone: 'critical' as const, mark: String(need), title: t('settings.sync.needYou', { count: need, defaultValue: '{{count}} need you' }), sub: t('settings.sync.needYouSub', 'The server said no to these. Each says why.') }
    : waiting
      ? { tone: 'warn' as const, mark: String(waiting), title: t('settings.sync.onPhone', { count: waiting, defaultValue: '{{count}} things are on this phone' }), sub: online ? t('settings.sync.sending', 'Sending now…') : t('settings.sync.noSignal', 'No signal. They send by themselves when there is one.') }
      : { tone: 'accent' as const, mark: '✓', title: t('settings.sync.allSent', 'Everything is on the server'), sub: snapshot.lastSuccessAt ? t('settings.sync.lastSent', { time: time(snapshot.lastSuccessAt), defaultValue: 'Last sent at {{time}}' }) : t('offline.sync.neverSynced') };
  const toneBg = head.tone === 'critical' ? c.criticalTint : head.tone === 'warn' ? c.warnTint : c.accentTint;
  const toneFg = head.tone === 'critical' ? c.critical : head.tone === 'warn' ? c.warn : c.accent;

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/profile' as Href));
  const row = (o: OutboxOp, i: number, right: React.ReactNode, sub?: string) => (
    <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3), borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{label(o)}</AText>
        {sub ? <AText variant="caption" tone="muted">{sub}</AText> : null}
      </View>
      {right}
    </View>
  );

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={t('offline.sync.title', 'Sync')} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12), gap: amazen.space(3) }, wide]}
        refreshControl={available ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} /> : undefined}
      >
        {!available ? (
          <View style={{ backgroundColor: c.well, borderRadius: amazen.radius.panel, padding: amazen.space(4), gap: amazen.space(2) }}>
            {/* Why, not only that: "update the app" answers one of these and would send the other to a store with nothing for them. */}
            <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>
              {unavailableReason === 'failed' || unavailableReason === 'no-org' ? t('offline.sync.unavailableFailed') : t('offline.sync.unavailable', { version: appVersion })}
            </AText>
            {/* Not translated: read by whoever is sent the screenshot, not by the member. */}
            {unavailableDetail ? <AText variant="caption" tone="muted" selectable>{`${appVersion} · js ${jsBuild} · ${unavailableDetail}`}</AText> : null}
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), padding: amazen.space(4), borderRadius: 22, backgroundColor: toneBg }}>
              <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: toneBg, alignItems: 'center', justifyContent: 'center' }}>
                <AText numeric style={{ color: toneFg, fontSize: 18 }}>{head.mark}</AText>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <AText variant="body" tone="strong" style={{ fontSize: 16 }}>{head.title}</AText>
                <AText variant="caption" tone="muted">{head.sub}</AText>
              </View>
            </View>
            {online ? <PrimaryButton label={t('offline.sync.syncNow', 'Sync now')} loading={refreshing} onPress={() => void refresh()} /> : null}

            {need ? (
              <>
                <SectionLabel tone="critical" style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>{`${t('offline.sync.attention')} · ${need}`}</SectionLabel>
                <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
                  {groups.attention.map((o, i) => (
                    <View key={o.id} style={{ paddingVertical: amazen.space(3), gap: 4, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5, flexShrink: 1 }}>{label(o)}</AText>
                        <AText variant="caption" tone="muted" numeric>{time(o.createdAt)}</AText>
                      </View>
                      <AText variant="caption" style={{ color: c.critical, lineHeight: 18 }}>{reason(o)}</AText>
                      <View style={{ flexDirection: 'row', gap: amazen.space(2), marginTop: 6 }}>
                        {o.state === 'failed' ? <SmallButton label={t('offline.sync.retry')} onPress={() => void engine?.retry(o.id)} /> : null}
                        <SmallButton label={o.state === 'conflict' ? t('offline.sync.gotIt') : t('offline.sync.discard')} critical={o.state !== 'conflict'} onPress={() => void engine?.discard(o.id)} />
                      </View>
                    </View>
                  ))}
                </Well>
              </>
            ) : null}

            {waiting ? (
              <>
                <SectionLabel tone="warn" style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>{`${t('offline.sync.waiting')} · ${waiting}`}</SectionLabel>
                <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
                  {groups.waiting.map((o, i) => {
                    const wifi = o.lastError?.code === 'WAITING_FOR_WIFI';
                    return row(o, i, <Pill label={wifi ? 'Wi-Fi' : t('offline.chip.waiting')} tone="warn" />,
                      wifi ? t('offline.errors.WAITING_FOR_WIFI') : t('offline.sync.waitingSince', { time: time(o.createdAt) }));
                  })}
                </Well>
              </>
            ) : null}

            {groups.sent.length ? (
              <>
                <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>{`${t('settings.sync.sentToday', 'Sent today')} · ${groups.sent.length}`}</SectionLabel>
                <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
                  {groups.sent.slice(0, 20).map((o, i) => row(o, i, <AText variant="caption" tone="muted" numeric>{time(o.createdAt)}</AText>))}
                </Well>
              </>
            ) : null}

            <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>{t('offline.sync.thisPhone')}</SectionLabel>
            <Well style={{ paddingHorizontal: amazen.space(3.5) }}>
              <SwitchRow first title={t('offline.sync.wifiOnly')} sub={t('offline.sync.wifiOnlyHint')} value={wifiOnly} onChange={(v) => void preferences?.set({ photosOnWifiOnly: v })} />
              {[
                [t('offline.sync.photosWaiting'), t('offline.sync.photosWaitingValue', { count: storage.waitingCount, size: formatBytes(storage.waitingBytes) })],
                [t('offline.sync.keptOffline'), formatBytes(storage.keptBytes)],
              ].map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: amazen.space(3), borderTopWidth: 1, borderTopColor: c.lineWell }}>
                  <AText variant="body" tone="muted" style={{ fontSize: 13.5, flexShrink: 1 }}>{k}</AText>
                  <AText variant="body" tone="strong" numeric style={{ fontSize: 13.5 }}>{v}</AText>
                </View>
              ))}
              {storage.waitingBytes > STORAGE_WARN_BYTES ? (
                <AText variant="caption" style={{ color: c.warn, paddingBottom: amazen.space(3) }}>
                  {t(storage.waitingBytes > STORAGE_URGENT_BYTES ? 'offline.sync.storageUrgent' : 'offline.sync.storageWarning', { size: formatBytes(storage.waitingBytes) })}
                </AText>
              ) : null}
            </Well>
          </>
        )}
      </ScrollView>
    </Ground>
  );
}

function SmallButton({ label, onPress, critical }: { label: string; onPress: () => void; critical?: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ borderRadius: amazen.radius.full, backgroundColor: c.tile, paddingHorizontal: 14, paddingVertical: 8, opacity: pressed ? 0.8 : 1 })}>
      <AText variant="caption" style={{ fontSize: 13, color: critical ? c.critical : c.inkStrong }}>{label}</AText>
    </Pressable>
  );
}
