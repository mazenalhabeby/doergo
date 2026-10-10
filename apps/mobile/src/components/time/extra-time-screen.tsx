import React, { useCallback, useMemo, useState } from 'react';
import { useNow } from '../../hooks/use-now';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { TimeEntry } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { attendanceApi } from '../../lib/api/attendance';
import { useResponsive } from '../../lib/responsive';
import { AText, Ground, HeaderBack, PrimaryButton, ScreenHeader, Sunken, Well, useTabSafe } from '../amazen';
import { centeredContent } from '../screen-container';
import { Initials, JobSheet, ReceiptRow, SectionLabel, StateEyebrow } from '../job/job-ui';
import { minutesPastEnd, stepExtra, suggestedExtra } from './time-logic';
import { personName, formatDuration } from '@hbcfield/shared/client';

/**
 * EXTRA TIME — who is working past their shift, by how much, and one tap to
 * approve that much.
 *
 * ⚠️ NO NEW DATA. Every figure is the list's own: the shift's planned start and
 * end, the clock-in, the clock-out. "Past the end" is computed against NOW for
 * somebody still working — so it grows while the leader looks — and against
 * the clock-out for somebody who has left.
 *
 * ⚠️ THE SUGGESTION IS AN OFFER, NOT A DECISION. The button says the amount it
 * will approve ("Approve · 1h 45m"); the sheet it opens is where the leader
 * changes it. Nothing is approved without that second tap.
 *
 * ⚠️ WHO MAY SEE AND DECIDE IS THE SERVER'S: the list is narrowed to the spaces
 * where the caller holds `canApproveOvertime`, never offers a leader their own
 * request, and approve/reject re-check both.
 */
export function ExtraTimeScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const tabSafe = useTabSafe();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;
  const { formatClock } = useTimeFormat();
  const clockOf = (e: TimeEntry, iso: string) => formatClock(iso, e.timezone ?? e.location?.timezone ?? undefined);

  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [approve, setApprove] = useState<TimeEntry | null>(null);
  const [reject, setReject] = useState<TimeEntry | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);

  // The minute moves, so "past the end" does too — derived, never counted up.
  const nowMs = useNow(30_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  const load = useCallback(async () => {
    try {
      setEntries(await attendanceApi.getPendingExtraTime());
    } catch (err: unknown) {
      if ((err as { statusCode?: number })?.statusCode === 401) return;
      setEntries((prev) => prev ?? []);
      toast.error(t('common.error'), (err as Error)?.message || t('shiftReminder.loadFailed'));
    }
  }, [toast, t]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const list = entries ?? [];
  const working = list.filter((e) => !e.clockOutAt);
  const left = list.filter((e) => !!e.clockOutAt);
  const total = useMemo(() => list.reduce((a, e) => a + minutesPastEnd(e, now), 0), [list, now]);

  const openApprove = (e: TimeEntry) => {
    setMinutes(suggestedExtra(minutesPastEnd(e, new Date())));
    setApprove(e);
  };

  const doApprove = async () => {
    if (!approve || busy) return;
    setBusy(true);
    try {
      await attendanceApi.approveExtraTime(approve.id, minutes);
      setApprove(null);
      toast.success(t('common.success'), t('shiftReminder.approveSuccess'));
      await load();
    } catch (err: unknown) {
      toast.error(t('common.error'), (err as Error)?.message || t('shiftReminder.approveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!reject || busy) return;
    setBusy(true);
    try {
      await attendanceApi.rejectExtraTime(reject.id);
      setReject(null);
      toast.info(t('shiftReminder.rejectSuccess'));
      await load();
    } catch (err: unknown) {
      toast.error(t('common.error'), (err as Error)?.message || t('shiftReminder.rejectFailed'));
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.navigate('/(app)/(tabs)/attendance' as Href);
  };

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={t('extraTime.title', 'Extra time')} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe, gap: amazen.space(3) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.accent} colors={[c.accent]} />}
      >
        {entries === null ? (
          <AText variant="caption" tone="onGlass" style={{ paddingVertical: amazen.space(4), textAlign: 'center' }}>{t('common.loading', 'Loading…')}</AText>
        ) : list.length === 0 ? (
          <Well style={{ paddingVertical: amazen.space(8), paddingHorizontal: amazen.space(5), alignItems: 'center', gap: amazen.space(2) }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
              <AText variant="h2" tone="accent">✓</AText>
            </View>
            <AText variant="h3" tone="strong" style={{ fontFamily: amazen.font.sansLight }}>{t('extraTime.emptyTitle', 'Nothing waiting')}</AText>
            <AText variant="body" tone="ink" style={{ textAlign: 'center', fontSize: 13.5, lineHeight: 20 }}>
              {t('extraTime.emptyBody', 'When somebody asks for extra time, it shows here and you get a notification.')}
            </AText>
          </Well>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
              <Figure value={String(list.length)} label={t('extraTime.waiting', { count: list.length, defaultValue: 'waiting for you' })} />
              <Figure value={formatDuration(total)} label={t('extraTime.askedSoFar', 'asked for, so far')} />
            </View>
            {working.length ? <SectionLabel tone="accent" style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(1) }}>{t('extraTime.stillWorking', { count: working.length, defaultValue: 'Still working · {{count}}' })}</SectionLabel> : null}
            {working.map((e) => <Request key={e.id} entry={e} now={now} onApprove={() => openApprove(e)} onReject={() => setReject(e)} />)}
            {left.length ? <SectionLabel style={{ paddingHorizontal: amazen.space(1), paddingTop: amazen.space(1) }}>{t('extraTime.clockedOut', { count: left.length, defaultValue: 'Clocked out · {{count}}' })}</SectionLabel> : null}
            {left.map((e) => <Request key={e.id} entry={e} now={now} onApprove={() => openApprove(e)} onReject={() => setReject(e)} />)}
          </>
        )}
      </ScrollView>

      <ApproveSheet entry={approve} minutes={minutes} setMinutes={setMinutes} now={now} busy={busy} onClose={() => setApprove(null)} onConfirm={() => void doApprove()} />

      <JobSheet visible={!!reject} onClose={() => setReject(null)} busy={busy} title={reject ? t('extraTime.rejectTitle', { defaultValue: 'Reject {{name}}’s extra time?', name: reject.user?.firstName ?? '' }) : undefined}>
        {reject ? (
          <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>
            {reject.expectedClockOutAt
              ? t('extraTime.rejectBody', { defaultValue: 'Their time counts until the shift end, {{time}}. They are told.', time: clockOf(reject, reject.expectedClockOutAt) })
              : t('extraTime.rejectBodyNoEnd', 'They are told.')}
          </AText>
        ) : null}
        <PrimaryButton label={t('extraTime.keepWaiting', 'Keep it waiting')} onPress={() => setReject(null)} />
        <Pressable onPress={() => void doReject()} disabled={busy} accessibilityRole="button" style={{ alignSelf: 'center', padding: amazen.space(2) }}>
          <AText variant="body" tone="critical" style={{ fontSize: 14.5 }}>{t('shiftReminder.reject', 'Reject')}</AText>
        </Pressable>
      </JobSheet>
    </Ground>
  );

}

function Figure({ value, label }: { value: string; label: string }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ flex: 1, borderRadius: 18, paddingVertical: amazen.space(2.75), paddingHorizontal: amazen.space(3), backgroundColor: c.glass, borderWidth: 1, borderColor: c.lineGlass }}>
      <AText variant="h2" tone="strong" numeric style={{ fontFamily: amazen.font.mono, fontSize: 24, lineHeight: 30 }}>{value}</AText>
      <AText variant="caption" tone="onGlass" numberOfLines={1}>{label}</AText>
    </View>
  );
}

/** One request: who, the shift drawn with the time past its end, and the two answers. */
function Request({ entry, now, onApprove, onReject }: { entry: TimeEntry; now: Date; onApprove: () => void; onReject: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { formatClock: clock } = useTimeFormat();
  const tz = entry.timezone ?? entry.location?.timezone ?? undefined;
  const open = !entry.clockOutAt;
  const past = minutesPastEnd(entry, now);
  const start = entry.expectedClockInAt ?? entry.clockInAt;
  const shift = entry.expectedClockOutAt ? Math.max(1, (Date.parse(entry.expectedClockOutAt) - Date.parse(start)) / 60_000) : 1;
  const name = personName(entry.user) || t('shiftReminder.unknownWorker');

  return (
    <Well style={{ padding: amazen.space(3.5), gap: amazen.space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3) }}>
        <Initials first={entry.user?.firstName} last={entry.user?.lastName} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 15, fontFamily: amazen.font.sansMedium }}>{name}</AText>
          <AText variant="caption" tone="muted" numberOfLines={1}>
            {[entry.location?.name, t('extraTime.inAt', { defaultValue: 'in {{time}}', time: clock(entry.clockInAt, tz) })].filter(Boolean).join(' · ')}
          </AText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: open ? c.accentTint : c.tile }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: open ? c.accent : c.ink }} />
          <AText numberOfLines={1} style={{ fontFamily: amazen.font.mono, fontSize: 10, letterSpacing: 1.2, color: open ? c.accent : c.ink, textTransform: 'uppercase' }}>
            {open ? t('extraTime.working', 'Working') : t('extraTime.left', 'Clocked out')}
          </AText>
        </View>
      </View>

      <View style={{ gap: amazen.space(1.5) }}>
        <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
          <View style={{ flex: shift, backgroundColor: c.accent, opacity: 0.5 }} />
          {/* ⚠️ Past the end is `warn`, never `critical` — extra time is a request, not a fault. */}
          <View style={{ flex: Math.max(past, shift * 0.08), backgroundColor: c.warn }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AText variant="caption" tone="muted" numeric>{clock(start, tz)}</AText>
          {entry.expectedClockOutAt ? <AText variant="caption" tone="muted" numeric>{t('extraTime.endAt', { defaultValue: 'end {{time}}', time: clock(entry.expectedClockOutAt, tz) })}</AText> : null}
          <AText variant="caption" tone="warn" numeric>
            {open ? t('extraTime.nowAt', { defaultValue: 'now {{time}}', time: clock(now.toISOString(), tz) }) : t('extraTime.outAt', { defaultValue: 'out {{time}}', time: clock(entry.clockOutAt!, tz) })}
          </AText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: amazen.space(2) }}>
        <AText numeric style={{ fontFamily: amazen.font.mono, fontSize: 26, lineHeight: 32, color: c.warn }}>{formatDuration(past)}</AText>
        <AText variant="caption" tone="ink" style={{ flex: 1, fontSize: 12.5 }}>
          {open ? t('extraTime.pastCounting', 'past the end, and counting') : t('extraTime.pastLeft', 'past the end when they left')}
        </AText>
      </View>

      <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
        <Pressable
          onPress={onReject}
          accessibilityRole="button"
          style={({ pressed }) => ({ borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(4.5), minHeight: amazen.layout.tapMin + 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tile, opacity: pressed ? 0.75 : 1 })}
        >
          <AText variant="body" tone="ink" style={{ fontSize: 15 }}>{t('shiftReminder.reject', 'Reject')}</AText>
        </Pressable>
        <PrimaryButton style={{ flex: 1 }} label={t('shiftReminder.approve', 'Approve')} detail={formatDuration(suggestedExtra(past))} onPress={onApprove} />
      </View>
    </Well>
  );
}

/** Adjust, see where the shift will end, approve. */
function ApproveSheet({
  entry, minutes, setMinutes, now, busy, onClose, onConfirm,
}: {
  entry: TimeEntry | null;
  minutes: number;
  setMinutes: (m: number) => void;
  now: Date;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { formatClock: clock } = useTimeFormat();
  if (!entry) return <JobSheet visible={false} onClose={onClose}><View /></JobSheet>;
  const tz = entry.timezone ?? entry.location?.timezone ?? undefined;
  const open = !entry.clockOutAt;
  const until = suggestedExtra(minutesPastEnd(entry, now));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const newEnd = entry.expectedClockOutAt ? new Date(Date.parse(entry.expectedClockOutAt) + minutes * 60_000).toISOString() : null;
  const chip = (value: number, label: string) => {
    const on = value === minutes;
    return (
      <Pressable key={label} onPress={() => setMinutes(value)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={{ borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(2), backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent' }}>
        <AText variant="caption" style={{ fontSize: 13, color: on ? c.accent : c.ink }}>{label}</AText>
      </Pressable>
    );
  };
  const round = (dir: 1 | -1) => (
    <Pressable onPress={() => setMinutes(stepExtra(minutes, dir))} accessibilityRole="button" accessibilityLabel={dir > 0 ? t('extraTime.more', '15 minutes more') : t('extraTime.less', '15 minutes less')} hitSlop={6}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
      <AText variant="h2" tone="strong">{dir > 0 ? '+' : '−'}</AText>
    </Pressable>
  );

  return (
    <JobSheet
      visible
      onClose={onClose}
      busy={busy}
      eyebrow={<StateEyebrow tone="warn" live={open} label={[open ? t('extraTime.stillWorkingShort', 'Still working') : t('extraTime.left', 'Clocked out'), entry.location?.name].filter(Boolean).join(' · ')} />}
      title={t('extraTime.approveTitle', { defaultValue: 'Extra time for {{name}}', name: entry.user?.firstName ?? '' })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
        {round(-1)}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2 }} accessibilityLiveRegion="polite">
          {h ? <><AText numeric style={{ fontFamily: amazen.font.mono, fontSize: 56, lineHeight: 64, color: c.inkStrong }}>{h}</AText><AText variant="h3" tone="ink" style={{ marginRight: 6 }}>h</AText></> : null}
          <AText numeric style={{ fontFamily: amazen.font.mono, fontSize: 56, lineHeight: 64, color: c.inkStrong }}>{h ? String(m).padStart(2, '0') : m}</AText>
          <AText variant="h3" tone="ink">m</AText>
        </View>
        {round(1)}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(1.5) }}>
        {[15, 30, 60].map((v) => chip(v, formatDuration(v)))}
        {chip(until, `${open ? t('extraTime.untilNow', 'Until now') : t('extraTime.untilLeft', 'Until they left')} · ${formatDuration(until)}`)}
      </View>

      {entry.expectedClockOutAt && newEnd ? (
        <Sunken style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
          <ReceiptRow label={t('extraTime.shiftEnd', 'Shift end')} value={clock(entry.expectedClockOutAt, tz)} />
          <ReceiptRow label={t('extraTime.extra', 'Extra')} value={`+ ${formatDuration(minutes)}`} />
          <View style={{ borderTopWidth: 1, borderTopColor: c.lineWell, paddingTop: amazen.space(2) }}>
            <ReceiptRow strong label={t('extraTime.countsUntil', 'Counts until')} value={clock(newEnd, tz)} />
          </View>
        </Sunken>
      ) : null}

      <PrimaryButton label={t('shiftReminder.approve', 'Approve')} detail={formatDuration(minutes)} onPress={onConfirm} loading={busy} />
      <Pressable onPress={onClose} disabled={busy} accessibilityRole="button" style={{ alignSelf: 'center', padding: amazen.space(2) }}>
        <AText variant="body" tone="muted" style={{ fontSize: 14 }}>{t('extraTime.notNow', 'Not now')}</AText>
      </Pressable>
    </JobSheet>
  );
}
