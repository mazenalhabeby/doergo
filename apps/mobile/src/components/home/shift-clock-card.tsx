import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../contexts/toast-context';
import { useShift, useShiftActions } from '../../offline/attendance/use-shift';
import { SyncChip } from '../../offline/components/sync-chip';
import { LocationPickerSheet, ClockOutSheet } from '../../components';
import { ReportIssueSheet, ShiftIssueThreadSheet, ShiftIssueListSheet } from '../shift-issue-sheet';
import { useClockIn } from '../../hooks/useClockIn';
import { stopBackgroundHeartbeat } from '../../services/background-heartbeat';
import { stopGeofence } from '../../services/background-geofence';
import { formatDurationMinutes as formatDuration } from '../../lib/utils';
import { AText, Chip, Eyebrow, GlassCard, Hero, LiveDot, Disc, DiscRow } from '../amazen';
import { ClockInGlyph, ClockOutGlyph, BreakGlyph, IssueNewGlyph, IssueMineGlyph } from '../glyphs/shift-glyphs';
import { readShiftState, heroParts, type ScheduleKind } from './shift-state';

/**
 * ONE GLASS SURFACE, IN EVERY STATE.
 *
 * That matters more than it sounds. Clocked-out used to be a quiet navigation
 * row with a chevron and clocked-in a saturated green block; they shared
 * nothing, so the card was re-read from scratch every time it flipped. Only
 * the eyebrow, the figure and the discs change now.
 *
 * ⚠️ THE COLOUR CAME OFF THE CONTAINER. Once the whole card was brand green,
 * green stopped meaning *do this* — there was no colour left to promote the
 * primary action with, which is exactly why Clock Out ended up a pale pill in
 * the top-right corner at a third the area of "Report an issue", at the
 * furthest point on the card from a right thumb. Measured on the shipping
 * app: white on that pill was **2.70:1**, on the button that ends a shift
 * worked outdoors in gloves, and the pill itself was **1.24:1** against the
 * card — below the threshold at which an edge reads at all. Give the jade to
 * one disc and the hierarchy solves itself, with no change of size, position
 * or weight.
 *
 * ⚠️ NEVER THE WORD "PAID". Two clocks exist on one record: `clockInAt` /
 * `clockOutAt` are evidence, `countedStartAt` / `countedEndAt` / `paidMinutes`
 * are what payroll reads. Only the counted figure belongs here and it is
 * called **counted**. Say counted, worked, approved.
 *
 * ⚠️ THE CARD IS NOT A TARGET — only its parts. The hero and caption go to
 * `/attendance`; each disc does its own thing.
 *
 * Self-contained "shift clock" widget — the member clock-in/clock-out card plus
 * its Activity / Report-an-issue / My-issues sheets. Owns its own attendance +
 * break status, elapsed timer, clock-in (via useClockIn) and clock-out flows, so
 * a consumer just renders <ShiftClockCard /> with no required props. Used on the
 * admin dashboard and both member home screens (DRY).
 *
 * @param onChanged Called after a successful clock in / clock out so a parent
 *                  screen can refresh its own data.
 * @param style     Optional style applied to the card root.
 */
export function ShiftClockCard({
  onChanged,
  style,
}: {
  onChanged?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();

  // The shift from the server, or the phone's copy of it, with unsent changes on top.
  const shift = useShift();
  const attendanceStatus = shift.status;
  const breakStatus = shift.breaks;
  const shiftActions = useShiftActions();
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  const [isClockLoading, setIsClockLoading] = useState(false);
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [issueThreadId, setIssueThreadId] = useState<string | null>(null);
  const [issueListOpen, setIssueListOpen] = useState(false);

  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // ── Data fetching ──────────────────────────────────────────────────
  const fetchStatus = shift.refresh;

  // Initial load
  const initialFetchDoneRef = useRef(false);
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    fetchStatus();
  }, [fetchStatus]);

  // Refetch on focus
  useFocusEffect(
    useCallback(() => {
      fetchStatus();
    }, [fetchStatus])
  );

  // Elapsed time, now and every minute
  const clockInAt = attendanceStatus?.isClockedIn ? attendanceStatus.currentEntry?.clockInAt : undefined;
  useEffect(() => {
    if (!clockInAt) {
      setElapsedMinutes(0);
      return;
    }
    const tick = () => setElapsedMinutes(Math.floor((Date.now() - new Date(clockInAt).getTime()) / 60000));
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [clockInAt]);

  // Shared clock-in flow (GPS + location/remote picker) — one implementation
  // across the attendance tab and both home screens, so allowRemote members get
  // the "Work remotely" choice everywhere. (DRY)
  const clockIn = useClockIn({
    assignedLocations: attendanceStatus?.assignedLocations || [],
    isClockedIn: !!attendanceStatus?.isClockedIn,
    onClockedIn: () => {
      fetchStatus();
      onChangedRef.current?.();
    },
  });

  // ── Clock out ──────────────────────────────────────────────────────
  const handleClockOut = () => {
    setShowClockOutConfirm(true);
  };

  const confirmClockOut = async (notes: string) => {
    setShowClockOutConfirm(false);
    setIsClockLoading(true);
    try {
      const entryId = attendanceStatus?.currentEntry?.id;
      if (!entryId) return;
      const location = await clockIn.getCurrentLocation();
      if (!location) return;
      const outcome = await shiftActions.clockOut({ entryId, fix: location, notes: notes || undefined });
      if (outcome.kind === 'refused') {
        toast.error(t('common.error'), (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('home.fullTime.failedToClockOut'));
        return;
      }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      await stopBackgroundHeartbeat();
      await stopGeofence();
      await fetchStatus();
      onChangedRef.current?.();
    } catch (err: any) {
      toast.error(t('common.error'), err.message || t('home.fullTime.failedToClockOut'));
    } finally {
      setIsClockLoading(false);
    }
  };

  /*
    The rests.

    Both go through `useShiftActions`, so they queue when there is no signal
    exactly as the clock does, and the card reports a refusal in the member's
    own language rather than a raw message.

    `ruleId` names the PLANNED rest this satisfies. Without it the server picks
    whichever is next — which is what "take my rest now" means, and is the
    right answer for the Break disc; the overdue one names the rule, so the
    plan is marked taken rather than a second rest appearing beside it.
  */
  const startRest = async (ruleId?: string) => {
    const entryId = attendanceStatus?.currentEntry?.id;
    if (!entryId) return;
    setIsClockLoading(true);
    try {
      const outcome = await shiftActions.startRest({ entryId, ruleId });
      if (outcome.kind === 'refused') {
        toast.error(t('common.error'), outcome.message || t('common.error'));
        return;
      }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      await fetchStatus();
    } finally {
      setIsClockLoading(false);
    }
  };

  const endRest = async () => {
    const entryId = attendanceStatus?.currentEntry?.id;
    const breakId = breakStatus?.currentBreak?.id;
    if (!entryId || !breakId) return;
    setIsClockLoading(true);
    try {
      const outcome = await shiftActions.endRest({ entryId, breakId });
      if (outcome.kind === 'refused') {
        toast.error(t('common.error'), outcome.message || t('common.error'));
        return;
      }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      await fetchStatus();
    } finally {
      setIsClockLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  const router = useRouter();
  const { amazen } = useTheme();
  const c = amazen.color;

  /*
    Which of the eight, decided ONCE and outside the JSX — see `shift-state.ts`.
    The states of this card are exactly the kind of thing that grows a ninth
    branch inside a conditional at six in the evening.
  */
  const st = readShiftState({
    status: attendanceStatus,
    breaks: breakStatus,
    schedule: (user?.scheduleType ?? 'NONE') as ScheduleKind,
    monthlyHourBudget: user?.monthlyHourBudget ?? null,
    // ⚠️ A month-to-date total is a COUNT question and must not be summed on
    // the phone on every render. Until it is asked for as one, FLEXIBLE shows
    // the same elapsed figure and no month bar — which is honest, where an
    // invented target is not.
    monthMinutes: null,
    queued: shift.source === 'phone',
    // `elapsedMinutes` ticks the clock; the state reads `clockInAt` itself.
    now: new Date(Date.now() - (elapsedMinutes * 0)),
  });

  /*
    ⑧ NOT RENDERED. A member with no workspace assignment has nothing to clock
    into. Entitlement is asked before content, never after — and a row that
    cannot be seen makes no request at all.
  */
  const hasSomewhereToClockIn =
    (attendanceStatus?.assignedLocations?.length ?? 0) > 0 || !!user?.allowRemote;
  if (!hasSomewhereToClockIn && !attendanceStatus?.isClockedIn && st.kind !== 'unconfirmed') return null;

  const live = st.kind === 'working' || st.kind === 'restOverdue';
  const resting = st.kind === 'resting';
  const busy = isClockLoading || clockIn.isBusy;
  const entryId = attendanceStatus?.currentEntry?.id;

  const eyebrow =
    st.kind === 'unconfirmed' ? t('shiftClock.needsYourTime', 'NEEDS YOUR TIME')
    : resting ? t('shiftClock.onARest', 'ON A REST')
    : live ? t('shiftClock.onTheClock', 'ON THE CLOCK')
    : t('shiftClock.notOnTheClock', 'NOT ON THE CLOCK');

  const eyebrowTone =
    st.kind === 'unconfirmed' ? 'critical' as const
    : resting ? 'warn' as const
    : 'onGlassHome' as const;

  const dotColor =
    st.kind === 'unconfirmed' ? c.critical
    : resting ? c.warn
    : live ? c.accent
    : c.lineField;

  const caption = [
    st.workspace,
    st.countedMinutes !== null
      ? resting
        // The counted figure FREEZES and the card says it has frozen. A rest
        // that silently keeps counting is the bug this sentence prevents.
        ? t('shiftClock.countedFrozen', { counted: formatDuration(st.countedMinutes), defaultValue: `counted ${formatDuration(st.countedMinutes)}, not counting now` })
        : t('shiftClock.counted', { counted: formatDuration(st.countedMinutes), defaultValue: `counted ${formatDuration(st.countedMinutes)}` })
      : null,
    st.nextRest && st.restOverdueBy <= 0
      ? t('shiftClock.restDue', { time: clockTime(st.nextRest.dueAt), defaultValue: `rest due ${clockTime(st.nextRest.dueAt)}` })
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <GlassCard style={style as ViewStyle}>
        <Pressable
          onPress={() => router.push('/(app)/(tabs)/attendance' as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${eyebrow}. ${caption}`}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1) }}>
            <LiveDot color={dotColor} live={live} />
            <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow>
            <View style={{ flex: 1 }} />
            {/*
              ⑤ QUEUED — not a state of its own. The clock-in sits in the
              outbox and the card SAYS so; it does not pretend the office
              already knows.
            */}
            {st.queued ? <Chip label={t('shiftClock.queued', 'QUEUED')} tone="warn" /> : null}
            <SyncChip entityId={entryId} />
          </View>

          <View style={{ marginTop: amazen.space(3) }}>
            {st.kind === 'unconfirmed' ? (
              <AText variant="h2" tone="strong">{t('shiftClock.whenDidYouLeave', 'When did you leave?')}</AText>
            ) : st.minutes !== null ? (
              <Hero
                parts={heroParts(st.minutes)}
                tone={resting ? 'warn' : 'strong'}
                unitTone={resting ? 'warn' : 'onGlassHome'}
              />
            ) : (
              /*
                ① The hero is the NEXT thing, not a zero. A 72pt `0` is what
                the old dashboard did with `0/12`, and it is the same mistake
                at a smaller scale — so with nothing promised, the card says
                the sentence instead of drawing an empty figure.
              */
              <AText variant="h2" tone="strong">{t('shiftClock.readyToStart', 'Ready to start')}</AText>
            )}
          </View>

          {caption ? (
            <AText variant="caption" tone="onGlassHome" numberOfLines={2} style={{ marginTop: 2 }}>
              {caption}
            </AText>
          ) : null}

          {st.kind === 'unconfirmed' ? (
            <AText variant="caption" tone="onGlassHome" style={{ marginTop: amazen.space(1) }}>
              {t('shiftClock.leftRunning', { defaultValue: 'It was left running, so we closed it for you. Tell us the real time.' })}
            </AText>
          ) : null}

          {/* ④ The strip, and the reason the primary action moves below. */}
          {st.kind === 'restOverdue' ? (
            <View
              style={{
                marginTop: amazen.space(3),
                backgroundColor: c.warnTint,
                borderRadius: amazen.radius.field,
                paddingVertical: amazen.space(2),
                paddingHorizontal: amazen.space(3),
              }}
            >
              <AText variant="caption" tone="warn">
                {t('shiftClock.restOverdue', { minutes: st.restOverdueBy, defaultValue: `Your rest was due ${st.restOverdueBy} minutes ago` })}
              </AText>
            </View>
          ) : null}

          {/*
            ⚠️ NONE RENDERS NO TRACK AT ALL. A bar with no target invents one,
            and NONE is the column default — so the majority would get an
            invented target.
          */}
          {st.progress ? (
            <View style={{ marginTop: amazen.space(3), height: 4, borderRadius: 2, backgroundColor: c.tile, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.min(100, Math.round((st.progress.done / st.progress.target) * 100))}%`,
                  height: '100%',
                  backgroundColor: c.accent,
                }}
              />
            </View>
          ) : null}
        </Pressable>

        {/*
          ⚠️ EXACTLY ONE DISC IS FILLED, and its GLOW is what marks it primary —
          not its size and not its position. That is what lets the primary move
          (rest overdue offers *Start the rest*) without the row re-flowing.

          Every disc carries a label. Icons never carry meaning alone.
        */}
        <DiscRow style={{ marginTop: amazen.space(5) }}>
          {st.kind === 'unconfirmed' ? (
            <Disc
              Glyph={ClockOutGlyph}
              label={t('shiftClock.setRealTime', 'Set the real time')}
              filled
              onPress={() => router.push('/(app)/(tabs)/attendance' as Href)}
            />
          ) : live || resting ? (
            <>
              {st.kind === 'restOverdue' ? (
                <Disc
                  Glyph={BreakGlyph}
                  label={t('shiftClock.startRest', 'Start the rest')}
                  filled
                  disabled={busy}
                  /* Names the PLANNED rest, so the plan is marked taken rather
                     than a second rest appearing beside the one that is due. */
                  onPress={() => void startRest(st.nextRest?.ruleId)}
                />
              ) : null}
              {resting ? (
                <Disc
                  Glyph={BreakGlyph}
                  label={t('shiftClock.endRest', 'End the rest')}
                  filled
                  disabled={busy}
                  onPress={() => void endRest()}
                />
              ) : null}
              <Disc
                Glyph={ClockOutGlyph}
                label={t('home.fullTime.clockOut')}
                filled={st.kind === 'working'}
                disabled={busy}
                onPress={handleClockOut}
              />
              {st.kind === 'working' ? (
                <Disc
                  Glyph={BreakGlyph}
                  label={t('shiftClock.break', 'Break')}
                  disabled={busy}
                  onPress={() => void startRest()}
                />
              ) : null}
              {entryId ? (
                <Disc
                  Glyph={IssueNewGlyph}
                  label={t('issues.report', 'Report')}
                  onPress={() => setReportIssueOpen(true)}
                />
              ) : null}
              <Disc
                Glyph={IssueMineGlyph}
                label={t('issues.myIssues', 'My issues')}
                onPress={() => setIssueListOpen(true)}
              />
            </>
          ) : (
            <>
              <Disc
                Glyph={ClockInGlyph}
                label={t('home.fullTime.clockIn')}
                filled
                disabled={busy}
                onPress={clockIn.openClockInModal}
              />
              <Disc
                Glyph={IssueNewGlyph}
                label={t('issues.report', 'Report')}
                disabled={!entryId}
                onPress={() => setReportIssueOpen(true)}
              />
              <Disc
                Glyph={IssueMineGlyph}
                label={t('issues.myIssues', 'My issues')}
                onPress={() => setIssueListOpen(true)}
              />
            </>
          )}
        </DiscRow>
      </GlassCard>

      <LocationPickerSheet
        {...clockIn.pickerProps}
        confirmDisabled={clockIn.isClockingIn}
      />

      <ClockOutSheet
        visible={showClockOutConfirm}
        onClose={() => setShowClockOutConfirm(false)}
        onConfirm={confirmClockOut}
        title={t('home.fullTime.clockOutConfirmTitle')}
        message={t('home.fullTime.clockOutConfirmMessage')}
        confirmLabel={t('home.fullTime.clockOut')}
        cancelLabel={t('common.cancel')}
        notesLabel={t('home.fullTime.shiftNotesLabel')}
        notesPlaceholder={t('home.fullTime.shiftNotesPlaceholder')}
        isLoading={isClockLoading}
      />

      {/*
        ⚠️ ACTIVITY LEFT THE CARD.

        It was one of four equal full-width buttons beside Clock Out, which is
        a menu rather than a card — §3.1 asks for elapsed, workspace, counted,
        the next rest and ONE primary action. "What I did today" is a
        different widget and belongs in the `needs-action` row; the sheet
        itself is untouched and still opens from the attendance screen.
      */}
      <ReportIssueSheet
        visible={reportIssueOpen}
        onClose={() => setReportIssueOpen(false)}
        timeEntryId={attendanceStatus?.currentEntry?.id}
        spaceId={attendanceStatus?.currentEntry?.location?.id}
        onCreated={(id) => { setReportIssueOpen(false); setIssueThreadId(id); }}
      />
      <ShiftIssueThreadSheet
        visible={!!issueThreadId}
        onClose={() => setIssueThreadId(null)}
        issueId={issueThreadId}
        canManage={!!((user as any)?.canManageUsers || (user as any)?.canViewAllTasks)}
        currentUserId={(user as any)?.id}
      />
      <ShiftIssueListSheet
        visible={issueListOpen}
        onClose={() => setIssueListOpen(false)}
        onOpen={(id) => { setIssueListOpen(false); setIssueThreadId(id); }}
        onReport={attendanceStatus?.currentEntry?.id ? () => { setIssueListOpen(false); setReportIssueOpen(true); } : undefined}
      />
    </>
  );
}

/** `11:24` — a wall clock, in the member's own display preference. */
function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
