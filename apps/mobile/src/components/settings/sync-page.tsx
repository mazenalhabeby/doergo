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
import { StateCard, SwitchRow } from './settings-ui';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { useToast } from '../../island/island-context';
import { refusedShiftCopy, refusedSpaceId, SHIFT_OPS } from '../../offline/attendance/refused-shift';
import { ReportIssueSheet } from '../shift-issue-sheet';
import { formatFileSize } from '@hbcfield/shared/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const STORAGE_WARN_BYTES = 500 * 1024 * 1024;
const STORAGE_URGENT_BYTES = 1024 * 1024 * 1024;


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
  const { t, i18n } = useTranslation();
  const formatBytes = (bytes: number) => formatFileSize(Math.max(0, bytes), i18n.language);
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
  const timeFormat = useTimeFormat();
  const toast = useToast();
  const [report, setReport] = useState<{ opId: string; title: string; body: string; spaceId?: string } | null>(null);
  /*
    A refused clock-in, clock-out or rest says why in the member's terms, and
    offers no "Try again": that would resend the OLD time, and a day-old
    clock-in replayed is a back-dated shift with nobody to clock it out.
  */
  const shiftCopy = (o: OutboxOp) =>
    SHIFT_OPS.has(o.op) ? refusedShiftCopy(t, o, { clock: (d) => timeFormat.formatClock(d), date: (d) => timeFormat.formatDate(d) }) : null;
  /* Why something is still waiting, when the last attempt said. */
  const waitingWhy = (o: OutboxOp) => {
    const code = o.lastError?.code;
    if (code === 'WAITING_FOR_WIFI') return t('offline.errors.WAITING_FOR_WIFI');
    if (o.state === 'awaiting_auth') return t('settings.sync.waitingSignIn', 'Waiting for you to sign in again.');
    if (o.state === 'retry') return t('settings.sync.waitingRetry', "The server didn't answer. It tries again by itself.");
    return null;
  };
  const removeWaiting = async (o: OutboxOp) => {
    const gone = await engine?.cancelPending(o.id);
    if (!gone) toast.info(t('settings.sync.cantRemove', 'This already reached the server, so it stays. It finishes by itself.'));
  };

  /* The answer, in one line. */
  const need = groups.attention.length;
  const waiting = groups.waiting.length;
  const head = need
    ? { tone: 'critical' as const, mark: String(need), title: t('settings.sync.needYou', { count: need, defaultValue: '{{count}} need you' }), sub: t('settings.sync.needYouSub', 'The server said no to these. Each says why.') }
    : waiting
      ? { tone: 'warn' as const, mark: String(waiting), title: t('settings.sync.onPhone', { count: waiting, defaultValue: '{{count}} things are on this phone' }), sub: online ? t('settings.sync.sending', 'Sending now…') : t('settings.sync.noSignal', 'No signal. They send by themselves when there is one.') }
      : { tone: 'accent' as const, mark: '✓', title: t('settings.sync.allSent', 'Everything is on the server'), sub: snapshot.lastSuccessAt ? t('settings.sync.lastSent', { time: time(snapshot.lastSuccessAt), defaultValue: 'Last sent at {{time}}' }) : t('offline.sync.neverSynced') };

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
            <StateCard tone={head.tone} mark={head.tone === 'accent' ? undefined : head.mark} title={head.title} sub={head.sub} />
            {online ? <PrimaryButton label={t('offline.sync.syncNow', 'Sync now')} loading={refreshing} onPress={() => void refresh()} /> : null}

            {need ? (
              <OpSection tone="critical" title={`${t('offline.sync.attention')} · ${need}`}>
                {groups.attention.map((o, i) => {
                  const shiftWords = shiftCopy(o);
                  return (
                    <OpRow key={o.id} first={i === 0} title={label(o)} aside={<AText variant="caption" tone="muted" numeric>{time(o.createdAt)}</AText>}>
                      <AText variant="caption" style={{ color: c.critical, lineHeight: 18 }}>{shiftWords?.reason ?? reason(o)}</AText>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2), marginTop: 6 }}>
                        {shiftWords ? (
                          <>
                            {shiftWords.canClockInNow ? (
                              <SmallButton accent label={t('shiftClock.refused.clockInNow', 'Clock in now')} onPress={() => router.navigate('/(app)/(tabs)' as Href)} />
                            ) : null}
                            <SmallButton
                              label={t('shiftClock.refused.tellOffice', 'Tell my office')}
                              onPress={() => setReport({ opId: o.id, title: shiftWords.issueTitle, body: shiftWords.issueBody, spaceId: refusedSpaceId(o) })}
                            />
                          </>
                        ) : o.state === 'failed' ? <SmallButton label={t('offline.sync.retry')} onPress={() => void engine?.retry(o.id)} /> : null}
                        <SmallButton
                          label={o.state === 'conflict' ? t('offline.sync.gotIt') : shiftWords ? t('settings.sync.remove', 'Remove') : t('offline.sync.discard')}
                          critical={o.state !== 'conflict'}
                          onPress={() => void engine?.discard(o.id)}
                        />
                      </View>
                    </OpRow>
                  );
                })}
              </OpSection>
            ) : null}

            {waiting ? (
              <OpSection tone="warn" title={`${t('offline.sync.waiting')} · ${waiting}`}>
                {groups.waiting.map((o, i) => {
                  const wifi = o.lastError?.code === 'WAITING_FOR_WIFI';
                  const why = waitingWhy(o);
                  const removable = o.state === 'pending' || o.state === 'retry';
                  return (
                    <OpRow key={o.id} first={i === 0} centered title={label(o)} aside={<Pill label={wifi ? 'Wi-Fi' : t('offline.chip.waiting')} tone="warn" />}>
                      <AText variant="caption" tone="muted">{t('offline.sync.waitingSince', { time: time(o.createdAt) })}{why ? ` · ${why}` : ''}</AText>
                      {o.state === 'retry' || removable ? (
                        <View style={{ flexDirection: 'row', gap: amazen.space(2), marginTop: 6 }}>
                          {o.state === 'retry' && online ? <SmallButton label={t('settings.sync.tryNow', 'Try now')} onPress={() => void refresh()} /> : null}
                          {removable ? <SmallButton critical label={t('settings.sync.remove', 'Remove')} onPress={() => void removeWaiting(o)} /> : null}
                        </View>
                      ) : null}
                    </OpRow>
                  );
                })}
              </OpSection>
            ) : null}

            {groups.sent.length ? (
              <OpSection title={`${t('settings.sync.sentToday', 'Sent today')} · ${groups.sent.length}`}>
                {groups.sent.slice(0, 20).map((o, i) => row(o, i, <AText variant="caption" tone="muted" numeric>{time(o.createdAt)}</AText>))}
              </OpSection>
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
      <ReportIssueSheet
        visible={!!report}
        onClose={() => setReport(null)}
        spaceId={report?.spaceId}
        initialTitle={report?.title}
        initialDescription={report?.body}
        onCreated={(id) => {
          if (report) void engine?.discard(report.opId);
          setReport(null);
          router.navigate({ pathname: '/(app)/(tabs)/attendance', params: { issueId: id } } as unknown as Href);
        }}
      />
    </Ground>
  );
}

/** A group of operations: its counted title over a well. */
function OpSection({ title, tone, children }: { title: string; tone?: 'critical' | 'warn'; children: React.ReactNode }) {
  const { amazen } = useTheme();
  return (
    <>
      <SectionLabel tone={tone} style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(2) }}>{title}</SectionLabel>
      <Well style={{ paddingHorizontal: amazen.space(3.5) }}>{children}</Well>
    </>
  );
}

/** One operation in a group: what it is, something at the right of that line, and what follows under it. */
function OpRow({ first, title, aside, centered, children }: {
  first: boolean;
  title: string;
  aside: React.ReactNode;
  /** Centre the aside on the title line (a pill), rather than top-align it (a time). */
  centered?: boolean;
  children: React.ReactNode;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ paddingVertical: amazen.space(3), gap: 4, borderTopWidth: first ? 0 : 1, borderTopColor: c.lineWell }}>
      <View style={{ flexDirection: 'row', ...(centered ? { alignItems: 'center' as const } : null), justifyContent: 'space-between', gap: 8 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5, flexShrink: 1 }}>{title}</AText>
        {aside}
      </View>
      {children}
    </View>
  );
}

function SmallButton({ label, onPress, critical, accent }: { label: string; onPress: () => void; critical?: boolean; accent?: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ borderRadius: amazen.radius.full, backgroundColor: accent ? c.accentSolid : c.tile, paddingHorizontal: 14, paddingVertical: 8, opacity: pressed ? 0.8 : 1 })}>
      <AText variant="caption" style={{ fontSize: 13, color: accent ? c.accentInk : critical ? c.critical : c.inkStrong, fontFamily: accent ? amazen.font.sansMedium : undefined }}>{label}</AText>
    </Pressable>
  );
}
