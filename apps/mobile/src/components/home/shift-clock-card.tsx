import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../contexts/toast-context';
import { useShift, useShiftActions } from '../../offline/attendance/use-shift';
import { SyncChip } from '../../offline/components/sync-chip';
import { LocationPickerSheet, ClockOutSheet } from '../index';
import { ReportIssueSheet, ShiftIssueListSheet, ShiftIssueThreadSheet } from '../shift-issue-sheet';
import { useClockIn } from '../../hooks/useClockIn';
import { stopBackgroundHeartbeat } from '../../services/background-heartbeat';
import { stopGeofence } from '../../services/background-geofence';
import { formatDurationMinutes as formatDuration } from '../../lib/utils';
import { AText, Chip, Disc, DiscRow, Eyebrow, GlassCard, Hero, LiveDot } from '../amazen';
import { BreakGlyph, ClockInGlyph, ClockOutGlyph, IssueMineGlyph, IssueNewGlyph } from '../glyphs/shift-glyphs';
import { budgetParts, heroParts, readShiftState, scheduleFor } from './shift-state';
import { useScheduleTotals } from './use-schedule-totals';

/**
 * ONE GLASS SURFACE, IN EVERY STATE.
 *
 * ⚠️ THAT MATTERS MORE THAN IT SOUNDS. Clocked-out used to be a quiet
 * navigation row with a chevron and clocked-in a saturated green block; they
 * shared nothing, so the card was RE-READ FROM SCRATCH every time it flipped —
 * twice a day, by somebody in a hurry. Only the eyebrow, the figure and the
 * discs change now.
 *
 * ⚠️ THE COLOUR CAME OFF THE CONTAINER. Once the whole card was brand green,
 * green stopped meaning *do this* — there was no colour left to promote the
 * primary action with, which is exactly why Clock Out ended up a pale pill in
 * the top-right corner at a third the area of "Report an issue", at the
 * furthest point on the card from a right thumb. Measured on the shipping app:
 * white on that pill was **2.70:1**, on the button that ends a shift worked
 * outdoors in gloves, and the pill itself was **1.24:1** against the card.
 * Give the jade to one disc and the hierarchy solves itself.
 *
 * ⚠️ NEVER THE WORD "PAID" (rule 4). Two clocks exist on one record:
 * `clockInAt`/`clockOutAt` are evidence, `countedStartAt`/`paidMinutes` are
 * what payroll reads. Only the counted figure belongs here, and it is called
 * **counted**.
 *
 * ⚠️ THE CARD IS NOT A TAP TARGET — only its parts. The hero and caption go to
 * `/attendance`; each disc does its own thing. A card-wide target swallows the
 * disc row's edges and sends somebody to a screen they did not ask for.
 *
 * ❌ ACTIVITY LEFT THE CARD. Four equal full-width buttons is a menu, not a
 * card, and "what I did today" belongs to a different widget.
 */
export function ShiftClockCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { user } = useAuth();
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const c = amazen.color;

  /*
    ⚠️ THE SHIFT COMES FROM `use-shift.ts` AND NEVER FROM THE RESPONSE CACHE
    (rule 7). `/attendance/status` and `/attendance/breaks/status` are in the
    `NEVER` list in `response-cache.ts` on purpose: a kept answer would reply
    first, older, and pretend to be fresh — on the one card where that costs
    somebody a shift. The offline path is the richer one: pulled records with
    unsent changes laid on top, and the card SAYS the copy is from the phone.
  */
  const shift = useShift();
  const status = shift.status;
  const breaks = shift.breaks;
  const actions = useShiftActions();

  const [busy, setBusy] = useState(false);
  const [clockOutOpen, setClockOutOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  /*
    ⚠️ A MINUTE TICK THAT MOVES `now`, NOT A COUNTER THAT ACCUMULATES (rule 5).
    Every figure on this card is derived from `clockInAt` against the clock;
    this only says "the clock moved, read it again". A phone that slept through
    lunch is right the instant it wakes, because nothing was being counted.
  */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const refresh = shift.refresh;
  const first = useRef(false);
  useEffect(() => {
    if (first.current) return;
    first.current = true;
    void refresh();
  }, [refresh]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const schedule = scheduleFor(user?.scheduleType, status?.currentEntry ?? null);

  /*
    ⚠️ ASKED ONLY WHEN IT WILL BE READ. A FIXED member's hero is a rostered
    start and needs no totals, so the month is never fetched for them. See
    `use-schedule-totals.ts` for why it is one request per period rather than
    a sum on every render.
  */
  const totals = useScheduleTotals({
    schedule,
    revision: `${status?.isClockedIn ? '1' : '0'}:${status?.currentEntry?.id ?? ''}`,
    enabled: !status?.isClockedIn || schedule === 'FLEXIBLE',
  });

  /* Which of the eight, decided ONCE and outside the JSX — see `shift-state.ts`. */
  const st = readShiftState({
    status,
    breaks,
    declaredSchedule: user?.scheduleType,
    monthlyHourBudget: user?.monthlyHourBudget ?? null,
    monthMinutes: totals.monthMinutes,
    weekMinutes: totals.weekMinutes,
    lastToday: totals.lastToday,
    queued: shift.pendingSync,
    now,
  });

  const clockIn = useClockIn({
    assignedLocations: status?.assignedLocations ?? [],
    isClockedIn: !!status?.isClockedIn,
    onClockedIn: () => { void refresh(); },
  });

  const entryId = status?.currentEntry?.id;

  const confirmClockOut = useCallback(async (notes: string) => {
    setClockOutOpen(false);
    if (!entryId) return;
    setBusy(true);
    try {
      const fix = await clockIn.getCurrentLocation();
      if (!fix) return;
      const outcome = await actions.clockOut({ entryId, fix, notes: notes || undefined });
      if (outcome.kind === 'refused') {
        toast.error(
          t('common.error'),
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('home.fullTime.failedToClockOut'),
        );
        return;
      }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      await stopBackgroundHeartbeat();
      await stopGeofence();
      await refresh();
    } catch (err) {
      toast.error(t('common.error'), (err as Error)?.message || t('home.fullTime.failedToClockOut'));
    } finally {
      setBusy(false);
    }
  }, [entryId, clockIn, actions, toast, t, refresh]);

  /*
    The rests. Both go through `useShiftActions`, so they queue with no signal
    exactly as the clock does.

    ⚠️ `ruleId` NAMES THE PLANNED REST THIS SATISFIES. Without it the server
    picks whichever is next — which is what "take my rest now" means, and is
    right for the Break disc. The overdue one names the rule, so the plan is
    marked taken rather than a second rest appearing beside the one that is due.
  */
  const startRest = useCallback(async (ruleId?: string) => {
    if (!entryId) return;
    setBusy(true);
    try {
      const outcome = await actions.startRest({ entryId, ruleId });
      if (outcome.kind === 'refused') { toast.error(t('common.error'), outcome.message || t('common.error')); return; }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      await refresh();
    } finally { setBusy(false); }
  }, [entryId, actions, toast, t, refresh]);

  const endRest = useCallback(async () => {
    const breakId = breaks?.currentBreak?.id;
    if (!entryId || !breakId) return;
    setBusy(true);
    try {
      const outcome = await actions.endRest({ entryId, breakId });
      if (outcome.kind === 'refused') { toast.error(t('common.error'), outcome.message || t('common.error')); return; }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      await refresh();
    } finally { setBusy(false); }
  }, [entryId, breaks?.currentBreak?.id, actions, toast, t, refresh]);

  /*
    ⑧ NOT RENDERED — the eighth state, and the only one that draws nothing.

    A member with no workspace assignment has nothing to clock into, and a card
    offering them a Clock in button is a button that can only fail.

    ⚠️ AND IT IS DECIDED FROM AN ANSWER, NEVER FROM A MISSING ONE. "No
    assigned locations" and "we have not been told yet" are the same empty
    array, so reading it before the shift has loaded made the card VANISH
    whenever the status request was slow, failed, or the member was offline —
    the clock disappearing from the home screen of somebody standing outside a
    site with no signal, which is the exact shape of the bug
    `home-offline-guard.spec.ts` exists for. `source === 'none'` means nothing
    is known, from the server OR the phone's own copy, and nothing known is not
    a fact about this member.
  */
  const known = shift.source !== 'none';
  const somewhereToClockIn = (status?.assignedLocations?.length ?? 0) > 0 || !!user?.allowRemote;
  if (known && !somewhereToClockIn && !status?.isClockedIn && st.kind !== 'unconfirmed') return null;

  const live = st.kind === 'working' || st.kind === 'restOverdue';
  const resting = st.kind === 'resting';
  const working = busy || clockIn.isBusy;

  const eyebrow =
    st.kind === 'unconfirmed' ? t('shiftClock.needsYourTime', { defaultValue: 'NEEDS YOUR TIME' })
    : resting ? t('shiftClock.onARest', { defaultValue: 'ON A REST' })
    : live ? t('shiftClock.onTheClock', { defaultValue: 'ON THE CLOCK' })
    : st.kind === 'done' ? t('shiftClock.doneForToday', { defaultValue: 'DONE FOR TODAY' })
    : t('shiftClock.notOnTheClock', { defaultValue: 'NOT ON THE CLOCK' });

  const eyebrowTone =
    st.kind === 'unconfirmed' ? ('critical' as const)
    : resting ? ('warn' as const)
    : ('onGlassHome' as const);

  const dotColor =
    st.kind === 'unconfirmed' ? c.critical
    : resting ? c.warn
    : live ? c.accent
    /* ⚠️ ① takes `lineField` — the dot is present and quiet, so the row does
       not change shape when it lights up. */
    : c.lineField;

  const caption = captionFor();

  return (
    <>
      <GlassCard style={style as ViewStyle}>
        {/* ⚠️ ONLY THE HERO AND CAPTION NAVIGATE — never the whole card. */}
        <Pressable
          onPress={() => router.push('/(app)/(tabs)/attendance' as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${eyebrow}. ${caption}`}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1) }}>
            {/* ⚠️ The dot breathes ONLY while somebody is working. A pulse that
                never stops is decoration. */}
            <LiveDot color={dotColor} live={live} />
            <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow>
            <View style={{ flex: 1 }} />
            {/*
              ⑤ QUEUED — not a state of its own, a chip on ②. The shift is
              identical; the office simply has not heard about it yet, and the
              card SAYS so rather than pretending it has.
            */}
            {st.queued ? <Chip label={t('shiftClock.queued', { defaultValue: 'QUEUED' })} tone="warn" /> : null}
            <SyncChip entityId={entryId} />
          </View>

          <View style={{ marginTop: amazen.space(3) }}>{hero()}</View>

          {caption ? (
            /* ⚠️ `onGlassHome`, not `onGlass` — the Home gradient's top stop is
               lighter, and `#9fbdb4` measures 4.14:1 there. This caption is the
               one §8 names as at risk. */
            <AText variant="caption" tone="onGlassHome" numberOfLines={2} style={{ marginTop: 2 }}>
              {caption}
            </AText>
          ) : null}

          {/* ④ The strip — and the reason the primary action moves. */}
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
                {t('shiftClock.restOverdue', {
                  count: st.restOverdueBy,
                  defaultValue_one: 'Your rest was due a minute ago',
                  defaultValue_other: `Your rest was due ${st.restOverdueBy} minutes ago`,
                })}
              </AText>
            </View>
          ) : null}

          {/*
            ⚠️ `NONE` RENDERS NO TRACK AT ALL (rule 6). A bar with no target
            invents one, and NONE is the column's default — so the unconfigured
            majority would be measured against a number nobody promised them.
            `st.progress` is null for NONE by construction; this renders what it
            is given and decides nothing.
          */}
          {st.progress ? (
            <View
              style={{ marginTop: amazen.space(3), height: 4, borderRadius: 2, backgroundColor: c.tile, overflow: 'hidden' }}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: st.progress.target, now: st.progress.done }}
            >
              <View
                style={{
                  width: `${Math.min(100, Math.round((st.progress.done / st.progress.target) * 100))}%`,
                  height: '100%',
                  /* ⚠️ Past the target is `warn`, not `crit` — overtime is owed,
                     not wrong. Three different things per schedule kind; the
                     colour only says "past it". */
                  backgroundColor: st.progress.done > st.progress.target ? c.warn : c.accent,
                }}
              />
            </View>
          ) : null}
        </Pressable>

        {/*
          ⚠️ EXACTLY ONE DISC IS FILLED (rule 2), and its GLOW is what marks it
          primary — not its size and not its position. That is what lets the
          primary MOVE (④ offers *Start the rest*) without the row re-flowing.

          ⚠️ EVERY DISC CARRIES A LABEL (rule 3). Icons never carry meaning
          alone, least of all on a card used in gloves in the dark.
        */}
        <DiscRow style={{ marginTop: amazen.space(5) }}>{discs()}</DiscRow>
      </GlassCard>

      <LocationPickerSheet {...clockIn.pickerProps} confirmDisabled={clockIn.isClockingIn} />

      <ClockOutSheet
        visible={clockOutOpen}
        onClose={() => setClockOutOpen(false)}
        onConfirm={confirmClockOut}
        title={t('home.fullTime.clockOutConfirmTitle')}
        message={t('home.fullTime.clockOutConfirmMessage')}
        confirmLabel={t('home.fullTime.clockOut')}
        cancelLabel={t('common.cancel')}
        notesLabel={t('home.fullTime.shiftNotesLabel')}
        notesPlaceholder={t('home.fullTime.shiftNotesPlaceholder')}
        isLoading={busy}
      />

      <ReportIssueSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        timeEntryId={entryId}
        spaceId={status?.currentEntry?.location?.id}
        workspace={st.workspace}
        since={status?.currentEntry?.clockInAt ? clockTime(status.currentEntry.clockInAt) : null}
        onCreated={(id) => { setReportOpen(false); setThreadId(id); }}
      />
      <ShiftIssueListSheet
        visible={listOpen}
        onClose={() => setListOpen(false)}
        onOpen={(id) => { setListOpen(false); setThreadId(id); }}
        onReport={entryId ? () => { setListOpen(false); setReportOpen(true); } : undefined}
      />
      <ShiftIssueThreadSheet
        visible={!!threadId}
        onClose={() => setThreadId(null)}
        issueId={threadId}
        canManage={!!(user?.canManageUsers || user?.canViewAllTasks)}
        currentUserId={user?.id}
      />
    </>
  );

  /** The figure, and what it is measured against. */
  function hero() {
    if (st.kind === 'unconfirmed') {
      return <AText variant="h2" tone="strong">{t('shiftClock.whenDidYouLeave', { defaultValue: 'When did you leave?' })}</AText>;
    }
    /*
      ① THE HERO IS THE NEXT THING, NOT A ZERO. A 72pt `0` is the mistake the
      old dashboard made with `0/12`, and it is the same mistake at a larger
      size: a member reads the biggest thing on the card first, and being told
      they have done nothing is not what they opened the app for.
    */
    if (st.kind === 'before' && st.at) {
      return <Hero parts={[{ value: clockTime(st.at.toISOString()), unit: '' }]} tone="strong" small />;
    }
    if (st.kind === 'before' && st.schedule === 'FLEXIBLE' && st.minutes !== null && user?.monthlyHourBudget) {
      return <Hero parts={budgetParts(st.minutes, user.monthlyHourBudget)} tone="strong" unitTone="onGlassHome" small />;
    }
    if (st.minutes !== null) {
      return (
        <Hero
          parts={heroParts(st.minutes)}
          tone={resting ? 'warn' : 'strong'}
          unitTone={resting ? 'warn' : 'onGlassHome'}
          small={st.kind === 'before' || st.kind === 'done'}
        />
      );
    }
    return <AText variant="h2" tone="strong">{t('shiftClock.readyToStart', { defaultValue: 'Ready to start' })}</AText>;
  }

  /** `{workspace} · counted {n} · rest due {time}` — and never the word paid. */
  function captionFor(): string {
    if (st.kind === 'unconfirmed') {
      return t('shiftClock.leftRunning', {
        workspace: st.workspace ?? '',
        time: st.at ? clockTime(st.at.toISOString()) : '',
        defaultValue: `${st.workspace ?? ''}. We closed it at ${st.at ? clockTime(st.at.toISOString()) : ''} because it was left running.`,
      });
    }
    if (st.kind === 'done' && st.finished) {
      return [
        st.workspace,
        `${clockTime(st.finished.from.toISOString())} → ${clockTime(st.finished.to.toISOString())}`,
        st.finished.awaitingApproval
          ? t('shiftClock.countedWaiting', { defaultValue: 'counted, waiting for approval' })
          : t('shiftClock.countedApproved', { defaultValue: 'counted and approved' }),
      ].filter(Boolean).join(' · ');
    }
    if (st.kind === 'before' && st.startsInMinutes !== null && st.startsInMinutes > 0) {
      return [
        st.workspace,
        t('shiftClock.startsIn', {
          count: st.startsInMinutes,
          defaultValue_one: 'your shift starts in a minute',
          defaultValue_other: `your shift starts in ${st.startsInMinutes} minutes`,
        }),
      ].filter(Boolean).join(' · ');
    }
    if (st.queued && live) {
      return [st.workspace, t('shiftClock.waitingToReach', { defaultValue: 'waiting to reach the office' })]
        .filter(Boolean).join(' · ');
    }
    return [
      /*
        ③ `Back at 11:24` replaces the workspace, because during a rest the
        question is not where you are — it is when you are due back. Falls back
        to the workspace when the rest was taken outside any plan, where nobody
        said how long it is and a made-up time would be a promise.
      */
      resting && st.backAt
        ? t('shiftClock.backAt', {
            time: clockTime(st.backAt.toISOString()),
            defaultValue: `Back at ${clockTime(st.backAt.toISOString())}`,
          })
        : st.workspace,
      st.countedMinutes !== null
        ? resting
          /*
            ⚠️ ③ FREEZES THE COUNTED FIGURE AND SAYS SO. A rest that silently
            keeps counting is the bug this sentence prevents: the number stops
            moving and a member who does not know why assumes the app hung.
          */
          ? t('shiftClock.countedFrozen', {
              counted: formatDuration(st.countedMinutes),
              defaultValue: `counted ${formatDuration(st.countedMinutes)}, not counting now`,
            })
          : t('shiftClock.counted', {
              counted: formatDuration(st.countedMinutes),
              defaultValue: `counted ${formatDuration(st.countedMinutes)}`,
            })
        : null,
      st.nextRest && st.restOverdueBy <= 0
        ? t('shiftClock.restDue', {
            time: clockTime(st.nextRest.dueAt),
            defaultValue: `rest due ${clockTime(st.nextRest.dueAt)}`,
          })
        : null,
    ].filter(Boolean).join(' · ');
  }

  function discs() {
    const report = (
      <Disc
        key="report"
        Glyph={IssueNewGlyph}
        label={t('issues.reportShort', { defaultValue: 'Report' })}
        /* Nothing to file against without a shift — §4 sends `timeEntryId`. */
        disabled={!entryId}
        onPress={() => setReportOpen(true)}
      />
    );
    const mine = (
      <Disc
        key="mine"
        Glyph={IssueMineGlyph}
        label={t('issues.myIssuesShort', { defaultValue: 'My issues' })}
        onPress={() => setListOpen(true)}
      />
    );

    if (st.kind === 'unconfirmed') {
      return [
        <Disc
          key="fix"
          Glyph={ClockOutGlyph}
          label={t('shiftClock.setRealTime', { defaultValue: 'Set the real time' })}
          filled
          onPress={() => router.push('/(app)/(tabs)/attendance' as Href)}
        />,
        mine,
      ];
    }

    if (live || resting) {
      return [
        /*
          ④ ⚠️ THE ONLY PLACE IN THE CATALOGUE WHERE THE FILLED DISC IS NOT THE
          OBVIOUS ONE. Clock out is still one tap away; it is simply not what is
          being offered, because a rest that is already late is the thing that
          has to happen next.
        */
        st.kind === 'restOverdue' ? (
          <Disc
            key="take"
            Glyph={BreakGlyph}
            label={t('shiftClock.startRest', { defaultValue: 'Start the rest' })}
            filled
            disabled={working}
            onPress={() => void startRest(st.nextRest?.ruleId)}
          />
        ) : null,
        resting ? (
          <Disc
            key="end"
            Glyph={BreakGlyph}
            label={t('shiftClock.endRest', { defaultValue: 'End the rest' })}
            filled
            disabled={working}
            onPress={() => void endRest()}
          />
        ) : null,
        <Disc
          key="out"
          Glyph={ClockOutGlyph}
          label={t('home.fullTime.clockOut')}
          /* Filled in ② only — ③ and ④ have their own primary. */
          filled={st.kind === 'working'}
          disabled={working}
          onPress={() => setClockOutOpen(true)}
        />,
        st.kind === 'working' ? (
          <Disc
            key="break"
            Glyph={BreakGlyph}
            label={t('shiftClock.break', { defaultValue: 'Break' })}
            disabled={working}
            onPress={() => void startRest()}
          />
        ) : null,
        report,
        mine,
      ].filter(Boolean);
    }

    return [
      <Disc
        key="in"
        Glyph={ClockInGlyph}
        label={
          st.kind === 'done'
            ? t('shiftClock.clockInAgain', { defaultValue: 'Clock in again' })
            : t('home.fullTime.clockIn')
        }
        /*
          ⑥ ⚠️ NO FILLED DISC AT ALL. The day is done; offering a glowing
          primary to start another one is the card arguing with the member.
        */
        filled={st.kind !== 'done'}
        disabled={working}
        onPress={clockIn.openClockInModal}
      />,
      report,
      mine,
    ];
  }
}

/** `11:24` — a wall clock, in the member's own display preference. */
function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
