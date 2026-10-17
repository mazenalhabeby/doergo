import React, { useEffect, useMemo, useState } from 'react';
import { useNow } from '../../hooks/use-now';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useShift } from '../../offline/attendance/use-shift';
import { refusedShiftCopy, refusedSpaceId } from '../../offline/attendance/refused-shift';
import { useRefusedShift } from '../../offline/attendance/use-refused-shift';
import { useOffline } from '../../offline/offline-context';
import { SyncChip } from '../../offline/components/sync-chip';
import { BreakSheet, LocationPickerSheet, ClockOutSheet } from '../index';
import { ReportIssueSheet, ShiftIssueListSheet, ShiftIssueThreadSheet } from '../shift-issue-sheet';
import { useClockIn } from '../../hooks/useClockIn';
import { useMyHandovers, useRefreshMyHandovers } from '../../hooks/useMyHandovers';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { AText, CardSurface, Chip, DiscRow, Eyebrow, LiveDot } from '../amazen';
import { readShiftState, scheduleFor, totalsRevision } from './shift-state';
import { useScheduleTotals, type ScheduleTotalsView } from './use-schedule-totals';
import { useUnreadIssues } from './use-unread-issues';
import { useShiftClockActions } from './shift-clock/use-shift-clock-actions';
import { shiftCaption } from './shift-clock/shift-caption';
import { shiftDiscs } from './shift-clock/shift-discs';
import { ShiftHero } from './shift-clock/shift-hero';
import { ShiftProgress } from './shift-clock/shift-progress';
import { RefusedShiftBanner } from './shift-clock/refused-banner';
import { formatDuration } from '@hbcfield/shared/client';
import type { NoShiftNote } from '../time/time-logic';
import { useShiftClockCardView, type ShiftClockCardViewProps } from './use-shift-clock-card-view';
import { ShiftClockCardViewView } from './shift-clock-card-view-view';
import { ShiftClockCardViewQueued } from './shift-clock-card-view-queued';

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
  /*
    ⚠️ THE HOME'S OWN COPY OF THE SHIFT. The Time tab holds the shift itself
    (it also draws the day's timeline from it) and renders the view below with
    that one copy — two `useShift` calls on one screen are two loads, and two
    answers that can disagree for a frame.
  */
  const shift = useShift();
  useLiveRefresh(shift.refresh, null, { onReconnect: true });
  return <ShiftClockCardView shift={shift} style={style} />;
}

export function ShiftClockCardView({ shift, style, linkToTime = true, onSetRealTime, openIssueId, totals: given, noShift, onAskMoreTime }: ShiftClockCardViewProps) {
  const vm = useShiftClockCardView({ shift, style, linkToTime, onSetRealTime, openIssueId, totals: given, noShift, onAskMoreTime });
  const {
    user,
    amazen,
    t,
    router,
    c,
    clockOf,
    status,
    clockOutAt,
    setClockOutAt,
    breakOpen,
    setBreakOpen,
    reportOpen,
    setReportOpen,
    reportPrefill,
    setReportPrefill,
    listOpen,
    setListOpen,
    threadId,
    setThreadId,
    now,
    totals,
    st,
    clockIn,
    entryId,
    engine,
    refused,
    refusedCopy,
    unread,
    handovers,
    busy,
    confirmClockOut,
    startRest,
    endRest,
    known,
  } = vm;

  /*
    ⚠️ A CARD THAT DOES NOT KNOW YET MUST NOT STATE SOMETHING.

    Remembering the last shift removes the flash for everyone who has used the
    app before — but on the very first frame of a cold start, before the disk
    read resolves, there is genuinely no answer, and `ShiftState` has no word
    for that: it collapses to ①, so the card announced `NOT ON THE CLOCK /
    Ready to start` to somebody who was, in fact, on the clock. Captured on a
    simulator cold start: the first card frame read `Ready to start`, the next
    read `DONE FOR TODAY`.

    Drawing nothing for those frames is the honest answer and costs no design:
    the card arrives once, already right, instead of arriving wrong and
    correcting itself in front of the member. ⑧ below is the same decision for
    a different reason.
  */
  if (shift.source === 'pending') return null;

  /*
    ⚠️ AND ① vs ⑥ IS DECIDED BY A SECOND REQUEST, WHICH IS THE FLASH PEOPLE
    ACTUALLY SEE.

    `lastToday` — a shift that ended today — comes from `/attendance/history`,
    not from `/attendance/status`. So the card could have a complete, correct
    status answer and still draw ① `Ready to start`, then redraw as ⑥ `Done
    for today` when the second round trip landed. Remembering the shift alone
    does nothing about it, which is why two earlier attempts looked identical
    to the bug; captured frame by frame, the first card frame read `Ready to
    start` and the next read `DONE FOR TODAY`.

    "No shift ended today" and "we have not been told yet" are the same `null`,
    so the card waits for the answer rather than choosing on its absence — and
    only when nobody is on the clock, because ②–④ are decided from the status
    alone and must never wait for a courtesy total.
  */
  if (!status?.isClockedIn && !totals.ready) return null;
  const somewhereToClockIn = (status?.assignedLocations?.length ?? 0) > 0 || !!user?.allowRemote;
  if (known && !somewhereToClockIn && !status?.isClockedIn && st.kind !== 'unconfirmed') return null;

  /*
    This week so far, with the shift that is running now added on. The totals
    hook only counts CLOSED entries — a running shift is not a total yet — and
    a strip reading `This week 15h 52m` that ignores the hours being worked
    while somebody looks at it would be wrong in the one way they would notice.
  */
  const {
    weekSoFar,
    live,
    resting,
    working,
    eyebrow,
    eyebrowTone,
    dotColor,
    caption,
    noShiftLine,
    askMore,
  } = ShiftClockCardViewView({ noShift, onAskMoreTime, user, t, c, clockOf, totals, st, clockIn, busy });

  return (
    <>
      <ShiftClockCardViewQueued vm={vm} style={style} linkToTime={linkToTime} eyebrow={eyebrow} caption={caption} dotColor={dotColor} live={live} eyebrowTone={eyebrowTone} resting={resting} noShiftLine={noShiftLine} weekSoFar={weekSoFar} working={working} onSetRealTime={onSetRealTime} askMore={askMore} onAskMoreTime={onAskMoreTime} shift={shift} />

      <LocationPickerSheet {...clockIn.pickerProps} confirmDisabled={clockIn.isClockingIn} />

      {/*
        ⚠️ EVERYTHING THE SHEET SHOWS COMES FROM HERE — §11.4. Nothing new is
        fetched: the card already holds the shift, the counted figure and the
        target, and a second reader for the same numbers is a second chance for
        them to disagree with the hero the member was just looking at.
      */}
      {clockOutAt && status?.currentEntry ? (
        <ClockOutSheet
          visible
          onClose={() => setClockOutAt(null)}
          onConfirm={(input) => {
            // The frozen time goes with the sheet, before the write starts.
            setClockOutAt(null);
            void confirmClockOut(input);
          }}
          isLoading={busy}
          openJobs={handovers.open}
          onFinishJob={(id) => router.push({ pathname: '/task/[id]', params: { id } } as unknown as Href)}
          shift={{
            workspace: st.workspace,
            clockInAt: new Date(status.currentEntry.clockInAt),
            clockOutAt,
            restMinutes: status.currentEntry.unpaidBreakMinutes ?? 0,
            countedMinutes: st.countedMinutes ?? 0,
            /* ⚠️ Null on NONE — no roster, so ② and ③ cannot happen. */
            targetMinutes: st.progress?.target ?? null,
            shiftEndAt: status.currentEntry.expectedClockOutAt
              ? new Date(status.currentEntry.expectedClockOutAt)
              : null,
            /*
              ④ — how far outside the ring the phone last was. The excursion is
              the server's own answer; the sheet never re-derives a geofence.
            */
            awayMetres: status.activeExcursion?.lastDistanceM ?? null,
            approver: null,
          }}
        />
      ) : null}

      {/*
        ⚠️ ④ DOES NOT COME THROUGH HERE. A rest that is already late has one
        answer — take it — and naming its `ruleId` is what marks the plan
        satisfied rather than adding a second rest beside the one that is due.
        Asking "what kind?" at that moment is a question about a decision
        already made.
      */}
      <BreakSheet
        visible={breakOpen}
        onClose={() => setBreakOpen(false)}
        isLoading={busy}
        planned={st.nextRest}
        onStart={(input) => { setBreakOpen(false); void startRest(input); }}
      />

      <ReportIssueSheet
        visible={reportOpen}
        onClose={() => { setReportOpen(false); setReportPrefill(null); }}
        timeEntryId={reportPrefill ? undefined : entryId}
        spaceId={reportPrefill ? reportPrefill.spaceId : status?.currentEntry?.location?.id}
        workspace={reportPrefill ? null : st.workspace}
        since={!reportPrefill && status?.currentEntry?.clockInAt ? clockOf(status.currentEntry.clockInAt) : null}
        initialTitle={reportPrefill?.title}
        initialDescription={reportPrefill?.body}
        onCreated={(id) => {
          // The office has it now: the refusal is dealt with.
          if (reportPrefill && refused) void engine?.discard(refused.id);
          setReportOpen(false);
          setReportPrefill(null);
          setThreadId(id);
        }}
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
}
