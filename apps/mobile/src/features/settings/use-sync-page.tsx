import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useResponsive } from '@/lib/responsive';
import { formatTimeOfDay } from '@/lib/utils';
import { refusalInterpolation } from '@/lib/distance';
import { useConnectivity, useOffline, useSyncStatus } from '@/offline/offline-context';
import { OPEN_STATES, type OutboxOp } from '@/offline/outbox/types';
import { AText } from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { useTimeFormat } from '@/hooks/use-time-format';
import { useToast } from '@/island/island-context';
import { refusedShiftCopy, SHIFT_OPS } from '@/offline/attendance/refused-shift';
import { formatFileSize } from '@hbcfield/shared/client';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** SyncPage's state and handlers — everything before its markup, moved here unchanged. */
export function useSyncPage() {
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
      waiting: operations.filter((o) => OPEN_STATES.has(o.state)),
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
    if (o.state === 'held') return t('settings.sync.waitingHeld', 'The automatic clock sends this once you have stayed long enough.');
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
    ? {
        tone: 'critical' as const,
        mark: String(need),
        title: t('settings.sync.needYou', { count: need, defaultValue: '{{count}} need you' }),
        sub: t('settings.sync.needYouSub', 'The server said no to these. Each says why.'),
      }
    : waiting
      ? {
          tone: 'warn' as const,
          mark: String(waiting),
          title: t('settings.sync.onPhone', { count: waiting, defaultValue: '{{count}} things are on this phone' }),
          sub: online
            ? t('settings.sync.sending', 'Sending now…')
            : t('settings.sync.noSignal', 'No signal. They send by themselves when there is one.'),
        }
      : {
          tone: 'accent' as const,
          mark: '✓',
          title: t('settings.sync.allSent', 'Everything is on the server'),
          sub: snapshot.lastSuccessAt
            ? t('settings.sync.lastSent', { time: time(snapshot.lastSuccessAt), defaultValue: 'Last sent at {{time}}' })
            : t('offline.sync.neverSynced'),
        };

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/profile' as Href));
  const row = (o: OutboxOp, i: number, right: React.ReactNode, sub?: string) => (
    <View
      key={o.id}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: amazen.space(3),
        paddingVertical: amazen.space(3),
        borderTopWidth: i === 0 ? 0 : 1,
        borderTopColor: c.lineWell,
      }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>{label(o)}</AText>
        {sub ? <AText variant="caption" tone="muted">{sub}</AText> : null}
      </View>
      {right}
    </View>
  );

  return {
    amazen,
    c,
    t,
    formatBytes,
    wide,
    engine,
    preferences,
    unavailableReason,
    unavailableDetail,
    available,
    online,
    refreshing,
    appVersion,
    jsBuild,
    groups,
    wifiOnly,
    storage,
    refresh,
    label,
    reason,
    time,
    report,
    setReport,
    shiftCopy,
    waitingWhy,
    removeWaiting,
    need,
    waiting,
    head,
    back,
    row,
  };
}
