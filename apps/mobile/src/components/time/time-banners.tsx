import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { type AttendanceStatus, type BreakPlanItem, type BreakStatus, type GeofenceExcursion, formatDuration } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { formatDistance } from '../../lib/distance';
import type { OvertimeRequest } from '../../lib/api';
import { AText } from '../amazen';
import { Banner, JobSheet, QuietButton, SheetOption } from '../job/job-ui';
import { AlwaysLocationNudge } from '../always-location-nudge';
import { OutOfRingSheet } from '../out-of-ring-sheet';
import { RestCard } from '../rest-card';
import { waitingText, type NoShiftNote } from './time-logic';

/**
 * EVERYTHING THAT NEEDS THE MEMBER'S ATTENTION ABOUT THE SHIFT — one line each,
 * with its action in the line, above the card.
 *
 * ⚠️ NOTHING HERE ENDS A SHIFT. Clock out is the card's disc; a banner that
 * also clocked out would be a second clock-out path with a second rule for
 * what the sheet shows. These say what is happening and offer the one thing
 * that answers it.
 *
 * Ported from the old Time tab's banners, one for one — the out-of-ring
 * workflow, the legacy outside-the-site warning, extra time, the no-shift
 * allowance, the shift-ended prompt, the planned rests, the "Always" nudge.
 */
export function TimeBanners({
  status,
  breaks,
  watch,
  overtime,
  hasShiftScheduling,
  busy,
  onForgot,
  onRequestExtra,
  onChanged,
  noShiftHere,
}: {
  status: AttendanceStatus | null;
  breaks: BreakStatus | null;
  watch: { outside: { metres: number } | null; excursion: GeofenceExcursion | null; countdown: string; reporting: boolean; reportExcursion: (reason: string, minutes: number) => Promise<boolean> };
  overtime: OvertimeRequest | null;
  hasShiftScheduling: boolean;
  busy: boolean;
  /** "I forgot to clock out" — the real leave time. */
  onForgot: (at: Date) => void;
  /** "I'm working extra" — ask a leader. */
  onRequestExtra: () => void;
  onChanged: () => void;
  /** The workspace they are at and its no-shift rule (`noShiftHere` in time-logic) — the only one spoken of. */
  noShiftHere?: NoShiftNote | null;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { formatClock: formatTime } = useTimeFormat();
  const [explain, setExplain] = useState(false);
  const [forgot, setForgot] = useState(false);
  /* "I'm still working" on a session with no shift: hidden until the server's next hourly reminder. */
  const [stillWorkingAt, setStillWorkingAt] = useState<number | null>(null);

  const entry = status?.isClockedIn ? status.currentEntry : null;
  const tz = entry?.timezone ?? entry?.location?.timezone ?? undefined;
  const space = entry?.location?.name ?? t('attendance.unknownLocation');
  const ex = watch.excursion;
  const now = new Date();

  // The shift ended and they are still on the clock — flagged by the server, or simply past its end.
  const reminder = entry?.reminderState ?? 'NONE';
  const end = entry?.expectedClockOutAt ? new Date(entry.expectedClockOutAt) : null;
  const ended = !!end && end.getTime() <= now.getTime();
  /*
    ⚠️ NO PLANNED SHIFT is its own case. The server's safety net reminds anybody
    still clocked in 8 hours into a session with no shift (hourly after), and
    the card used to say "Your shift has ended" and offer extra time — for a
    shift that never existed. It says how long they have been on the clock
    instead, and "still working" only quiets it until the next reminder.
  */
  const unscheduled = !end;
  const hoursOpen = entry ? Math.max(1, Math.floor((now.getTime() - new Date(entry.clockInAt).getTime()) / 3_600_000)) : 0;
  const quieted = unscheduled && stillWorkingAt !== null && stillWorkingAt === (entry?.reminderCount ?? 0);
  const askEnded = !!entry && !quieted && (reminder === 'REMINDED' || reminder === 'ESCALATED' || (reminder === 'NONE' && ended));
  const limitLeft = entry?.endIsDailyLimit && end ? Math.ceil((end.getTime() - now.getTime()) / 60_000) : null;


  return (
    <View style={{ gap: amazen.space(2) }}>
      <AlwaysLocationNudge active={!!entry && entry.location?.lat != null} />

      {entry && ex?.status === 'OUT_UNREPORTED' ? (
        <Banner tone="warn" text={`${t('attendance.outOfRing.bannerOutTitle', { space })}. ${t('attendance.outOfRing.bannerOutBody')}`} action={{ label: t('attendance.outOfRing.tellUsWhy'), onPress: () => setExplain(true) }} />
      ) : null}
      {entry && ex?.status === 'PENDING' ? (
        <Banner tone="neutral" text={`${t('attendance.outOfRing.bannerPendingTitle')}. ${t('attendance.outOfRing.bannerPendingBody', { minutes: ex.requestedMinutes ?? '?' })}`} />
      ) : null}
      {entry && ex?.status === 'APPROVED' ? (
        <Banner tone="accent" text={`${t('attendance.outOfRing.bannerApprovedTitle')} · ${watch.countdown ? t('attendance.outOfRing.bannerApprovedBody', { time: watch.countdown }) : t('attendance.outOfRing.timeExpired')}`} />
      ) : null}
      {entry && !ex && watch.outside ? (
        <Banner tone="warn" text={`${t('attendance.outsideGeofence')} ${t('attendance.outsideGeofenceDistance', { distance: formatDistance(watch.outside.metres) })}`} />
      ) : null}

      {overtime && ['PENDING_TECHNICIAN', 'PENDING_APPROVAL', 'APPROVED'].includes(overtime.status) ? (
        <Banner
          tone={overtime.status === 'APPROVED' ? 'accent' : 'warn'}
          text={overtime.status === 'PENDING_TECHNICIAN' ? t('overtime.promptTitle') : overtime.status === 'PENDING_APPROVAL' ? waitingText(overtime, t) : t('overtime.overtimeActive')}
          action={{ label: t('time.banners.open', 'Open'), onPress: () => router.push(`/overtime/${overtime.id}` as Href) }}
        />
      ) : null}

      {entry && Array.isArray(entry.breakPlan) && entry.breakPlan.length > 0 ? (
        <RestCard
          entryId={entry.id}
          plan={entry.breakPlan as BreakPlanItem[]}
          activeBreak={breaks?.isOnBreak && breaks.currentBreak
            ? { id: breaks.currentBreak.id, startedAt: breaks.currentBreak.startedAt, ruleId: (breaks.currentBreak as { ruleId?: string | null }).ruleId ?? null }
            : null}
          onChanged={onChanged}
        />
      ) : null}

      {askEnded ? (
        <View style={{ borderRadius: 18, padding: amazen.space(3.5), gap: amazen.space(2.5), backgroundColor: amazen.color.warnTint }}>
          <View style={{ gap: 2 }}>
            <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>
              {unscheduled ? t('shiftReminder.unscheduledTitle', { count: hoursOpen }) : t('shiftReminder.shiftEndedTitle')}
            </AText>
            <AText variant="caption" tone="warn" style={{ fontSize: 13, lineHeight: 18 }}>
              {end ? `${t('shiftReminder.shiftEndedAt', { time: formatTime(end.toISOString(), tz) })} · ` : ''}
              {unscheduled ? t('shiftReminder.unscheduledSubtitle') : t('shiftReminder.shiftEndedSubtitle')}
            </AText>
          </View>
          <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
            <View style={{ flex: 1 }}><QuietButton label={t('shiftReminder.forgotClockOut')} onPress={() => setForgot(true)} disabled={busy} /></View>
            {unscheduled ? (
              <View style={{ flex: 1 }}><QuietButton tone="accent" label={t('shiftReminder.stillWorking')} onPress={() => setStillWorkingAt(entry?.reminderCount ?? 0)} disabled={busy} /></View>
            ) : hasShiftScheduling ? (
              <View style={{ flex: 1 }}><QuietButton tone="accent" label={t('shiftReminder.workingExtra')} onPress={onRequestExtra} disabled={busy} /></View>
            ) : null}
          </View>
        </View>
      ) : null}
      {/* The same wait as the extra-time line above — said once, with a name, when that line is shown. */}
      {entry && reminder === 'OVERTIME_PENDING' && overtime?.status !== 'PENDING_APPROVAL' ? (
        <Banner tone="neutral" text={`${t('shiftReminder.waitingApprovalTitle')}. ${t('shiftReminder.waitingApprovalSubtitle')}`} />
      ) : null}
      {entry && reminder === 'OVERTIME_APPROVED' ? (
        <Banner tone="accent" text={`${t('shiftReminder.extraApprovedTitle')}${end ? ` · ${t('shiftReminder.extraApprovedSubtitle', { time: formatTime(end.toISOString(), tz) })}` : ''}`} />
      ) : null}
      {limitLeft != null && limitLeft > 0 && limitLeft <= 30 && end ? (
        <Banner tone="warn" text={`${t('attendance.noShift.minutesLeft', { count: limitLeft })} · ${t('attendance.noShift.afterLimit', { time: formatTime(end.toISOString(), tz) })}`} />
      ) : null}

      {/* One line, only when the workspace they are at refuses them — never one per workspace. */}
      {noShiftHere?.allowance.kind === 'refused' ? (
        <Banner
          tone="critical"
          text={noShiftHere.allowance.reason === 'SHIFT_ONLY'
            ? t('attendance.noShift.shiftOnlyBody', { location: noShiftHere.location.name })
            : t('attendance.noShift.reachedShort', { location: noShiftHere.location.name, hours: formatDuration(noShiftHere.allowance.dailyMinutes ?? 0) })}
        />
      ) : null}

      <OutOfRingSheet
        visible={explain}
        spaceName={space}
        onClose={() => setExplain(false)}
        onSubmit={async (reason: string, minutes: number) => { if (await watch.reportExcursion(reason, minutes)) setExplain(false); }}
        isLoading={watch.reporting}
      />

      <JobSheet visible={forgot} onClose={() => setForgot(false)} busy={busy} title={t('shiftReminder.forgotSheetTitle')}>
        <AText variant="caption" tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>{t('shiftReminder.forgotSheetSubtitle')}</AText>
        {end ? (
          <SheetOption label={t('shiftReminder.atShiftEnd')} hint={formatTime(end.toISOString(), tz)} onPress={() => { setForgot(false); onForgot(end); }} disabled={busy} />
        ) : null}
        <SheetOption tone="accent" label={t('shiftReminder.now')} hint={formatTime(now.toISOString(), tz)} onPress={() => { setForgot(false); onForgot(new Date()); }} disabled={busy} />
      </JobSheet>
    </View>
  );
}

/** A link row under the page — Extra time approvals, for the people who approve. */
export function TimeLink({ label, hint, badge, onPress, Glyph }: { label: string; hint: string; badge?: number; onPress: () => void; Glyph: React.ComponentType<{ size?: number; color: string }> }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${hint}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(1), opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph size={20} color={c.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14 }}>{label}</AText>
        <AText variant="caption" tone="muted" numberOfLines={1}>{hint}</AText>
      </View>
      {badge ? (
        <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.warnTint, alignItems: 'center', justifyContent: 'center' }}>
          <AText variant="caption" tone="warn" numeric>{String(badge)}</AText>
        </View>
      ) : null}
      <AText variant="body" tone="muted">›</AText>
    </Pressable>
  );
}

