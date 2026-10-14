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

interface ShiftClockCardViewProps {
  shift: ReturnType<typeof useShift>;
  style?: StyleProp<ViewStyle>;
  /**
   * The hero and caption open the Time tab — except ON the Time tab, where a
   * link to the page you are on is a tap that does nothing visible.
   */
  linkToTime?: boolean;
  /** ⑦'s "Set the real time". Absent → it opens the Time tab, which asks. */
  onSetRealTime?: () => void;
  /** A tapped shift-issue notification names the thread to open. */
  openIssueId?: string | null;
  /**
   * The Time tab already asks for the week's totals (its week bars) — handed in
   * here so one screen makes one request, not one per reader.
   */
  totals?: ScheduleTotalsView;
  /**
   * The Time tab's one no-shift line: the workspace the member is at and its rule
   * (`noShiftHere` in time-logic). Absent on the home card, which shows no rule.
   */
  noShift?: NoShiftNote | null;
  /** With no hours left there: the button asks the leader for more time (an OVERTIME request). */
  onAskMoreTime?: () => void;
}

export function ShiftClockCardView({ shift, style, linkToTime = true, onSetRealTime, openIssueId, totals: given, noShift, onAskMoreTime }: ShiftClockCardViewProps) {
  const { user } = useAuth();
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const c = amazen.color;
  /*
    ⚠️ THE MEMBER'S OWN CLOCK, NOT THE DEVICE'S — and not a `toLocaleTimeString`
    call written here.

    `useTimeFormat` exists so "screens never hardcode 12h/24h": it reads
    `user.timeFormat` (which follows the person across devices) and renders in
    the ORGANIZATION'S timezone rather than silently converting to wherever the
    phone happens to be. This card was formatting times itself, so the same
    shift read `9:04 AM` on one phone and `09:43` on another — and a member who
    had chosen 24h got 12h here and 24h everywhere else in the app.

    ⚠️ AND THE ZONE MATTERS MORE THAN THE FORMAT. A shift belongs to the place
    it was worked; converting it to the device's zone makes a night shift
    clocked at 23:50 read as tomorrow to somebody who travelled.
  */
  const clockOf = useTimeFormat().formatTime;
  const timeFormat = useTimeFormat();

  /*
    ⚠️ THE SHIFT COMES FROM `use-shift.ts` AND NEVER FROM THE RESPONSE CACHE
    (rule 7). `/attendance/status` and `/attendance/breaks/status` are in the
    `NEVER` list in `response-cache.ts` on purpose: a kept answer would reply
    first, older, and pretend to be fresh — on the one card where that costs
    somebody a shift. The offline path is the richer one: pulled records with
    unsent changes laid on top, and the card SAYS the copy is from the phone.
  */
  const status = shift.status;
  const breaks = shift.breaks;

  /*
    ⚠️ THE CLOCK-OUT TIME IS FROZEN WHEN THE SHEET OPENS — §11 rule 4. A sheet
    left sitting on a table must not silently bill more minutes than the
    receipt showed; the member signs off the figure they can see.
  */
  const [clockOutAt, setClockOutAt] = useState<Date | null>(null);
  /*
    The Break disc asks which kind. ⚠️ It is an OFFER, not a gate — picking
    nothing starts exactly the rest the disc used to start on its own.
  */
  const [breakOpen, setBreakOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  /** A report already written — a refused clock-in, what and why — or null for a blank one. */
  const [reportPrefill, setReportPrefill] = useState<{ title: string; body: string; spaceId?: string } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  useEffect(() => {
    if (openIssueId) setThreadId(openIssueId);
  }, [openIssueId]);

  /*
    ⚠️ A MINUTE TICK THAT MOVES `now`, NOT A COUNTER THAT ACCUMULATES (rule 5).
    Every figure on this card is derived from `clockInAt` against the clock;
    this only says "the clock moved, read it again". A phone that slept through
    lunch is right the instant it wakes, because nothing was being counted.
  */
  const nowMs = useNow(30_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  const refresh = shift.refresh;
  /*
    ⚠️ ONE TRIGGER SET, AND THE MOUNT IS ONE OF THEM. A separate "first render"
    effect sat beside a focus effect and both fired as the card appeared: the
    status and the rests asked twice on every launch and every pull-to-refresh.
    The mount of a screen that is showing IS a focus.

    Focus, the app coming back (a shift ended on the web while the phone was in
    a pocket) and the signal returning — no timer: the minute tick above moves
    the figures, and nothing about the shift changes without one of these.
    ⚠️ No flush first: `useShift` lays every queued shift change over whatever
    the server says, so an answer from before the flush still reads right.
  */

  const schedule = scheduleFor(user?.scheduleType);

  /*
    ⚠️ ASKED ONLY WHEN IT WILL BE READ — a row you cannot see makes no request.
    A FIXED member on the clock is measured against TODAY, which comes off the
    shift itself, so no totals are fetched for them at all. FLEXIBLE needs the
    month whatever it is doing, and NONE needs the week both before the shift
    (the hero) and during it (the strip under the discs).

    See `use-schedule-totals.ts` for why it is one request per period rather
    than a sum on every render.
  */
  const own = useScheduleTotals({
    schedule,
    revision: totalsRevision(status, shift.pendingSync),
    enabled: !given && (!status?.isClockedIn || schedule !== 'FIXED'),
    userId: user?.id ?? null,
  });
  const totals = given ?? own;

  /* Which of the eight, decided ONCE and outside the JSX — see `shift-state.ts`. */
  const st = readShiftState({
    status,
    breaks,
    declaredSchedule: user?.scheduleType,
    monthlyHourBudget: user?.monthlyHourBudget ?? null,
    monthMinutes: totals.monthMinutes,
    weekMinutes: totals.weekMinutes,
    lastToday: totals.lastToday,
    lastIn: totals.lastIn,
    queued: shift.pendingSync,
    now,
  });

  const refreshHandovers = useRefreshMyHandovers();
  const clockIn = useClockIn({
    assignedLocations: status?.assignedLocations ?? [],
    isClockedIn: !!status?.isClockedIn,
    // A clock-in is when a paused job is offered back (the home jobs strip).
    onClockedIn: () => { void refresh(); refreshHandovers(); },
  });

  const entryId = status?.currentEntry?.id;

  /*
    A clock-in, clock-out or rest the server refused AFTER the card had shown
    it done (see refused-shift.ts). Said on the card until the member deals
    with it — the card used to drop back to "Ready to start" and say nothing.
  */
  const { running: engine } = useOffline();
  const refused = useRefusedShift();
  const refusedCopy = refused
    ? refusedShiftCopy(t, refused, { clock: (d) => timeFormat.formatClock(d), date: (d) => timeFormat.formatDate(d) })
    : null;
  /* A clock-in that went through replaces the refused one — nothing is left to deal with. */
  useEffect(() => {
    if (refused?.op === 'attendance.clockIn' && status?.isClockedIn && !shift.pendingSync && engine) void engine.discard(refused.id);
  }, [refused, status?.isClockedIn, shift.pendingSync, engine]);

  /*
    ⚠️ THE SAME NUMBER THE LIST SHOWS — see `use-unread-issues.ts`. The disc
    badge and the row pill both come from `unreadFor`; two counters for one
    idea is how they drift by one and stop being believed.
  */
  const unread = useUnreadIssues(true);

  /*
    Jobs still in work: listed in the clock-out sheet, paused by the clock-out
    (shared tasks/handover.ts). Read by the card, like every other figure the
    sheet shows — the sheet itself fetches nothing.
  */
  const handovers = useMyHandovers({ enabled: !!status?.isClockedIn });

  const { busy, confirmClockOut, startRest, endRest } = useShiftClockActions({ shift, entryId, clockIn, handovers });

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

    ⚠️ AND `pending` IS NOT KNOWN EITHER. It means the first request has not
    come back, which is the same absence wearing a different word — reading it
    as an answer would hide the card for the length of every cold start.
  */
  const known = shift.source !== 'none' && shift.source !== 'pending';

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
  const weekSoFar =
    totals.weekMinutes === null ? null : totals.weekMinutes + (st.countedMinutes ?? 0);

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
    : ('onGlass' as const);

  const dotColor =
    st.kind === 'unconfirmed' ? c.critical
    : resting ? c.warn
    : live ? c.accent
    /* ⚠️ ① takes `lineField` — the dot is present and quiet, so the row does
       not change shape when it lights up. */
    : c.lineField;

  const caption = shiftCaption(st, { t, clockOf, monthlyHourBudget: user?.monthlyHourBudget, live, resting });
  // Off the clock only: what the workspace they are at still allows today, or that it allows nothing more.
  const offClock = !live && !resting && st.kind !== 'unconfirmed';
  const noShiftLine = offClock && noShift?.allowance.kind === 'limited'
    ? t('shiftClock.noShiftLeft', { location: noShift.location.name, left: formatDuration(noShift.allowance.remainingMinutes), defaultValue: 'At {{location}} · no shift · {{left}} left today' })
    : null;
  const askMore = offClock && !!onAskMoreTime && noShift?.allowance.kind === 'refused' && noShift.allowance.reason === 'NO_HOURS_LEFT';

  return (
    <>
      <CardSurface fallback="glass" style={[{ padding: amazen.layout.gutter }, style as ViewStyle]}>
        {/* ⚠️ ONLY THE HERO AND CAPTION NAVIGATE — never the whole card. */}
        <Pressable
          onPress={linkToTime ? () => router.push('/(app)/(tabs)/attendance' as Href) : undefined}
          disabled={!linkToTime}
          accessibilityRole={linkToTime ? 'button' : 'summary'}
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

          <View style={{ marginTop: amazen.space(3) }}><ShiftHero st={st} resting={resting} clockOf={clockOf} /></View>

          {caption ? (
            /* ⚠️ `onGlass` is measured over the ground's lighter top stop —
               lighter, and `#9fbdb4` measures 4.14:1 there. This caption is the
               one §8 names as at risk. */
            <AText variant="caption" tone="onGlass" numberOfLines={2} style={{ marginTop: 2 }}>
              {caption}
            </AText>
          ) : null}

          {noShiftLine ? (
            <AText variant="caption" tone="onGlass" numberOfLines={2} style={{ marginTop: amazen.space(2) }}>
              {noShiftLine}
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

          <ShiftProgress st={st} live={live} resting={resting} now={now} weekSoFar={weekSoFar} />
        </Pressable>

        {refused && refusedCopy ? (
          <RefusedShiftBanner
            copy={refusedCopy}
            onTellOffice={() => {
              setReportPrefill({ title: refusedCopy.issueTitle, body: refusedCopy.issueBody, spaceId: refusedSpaceId(refused) });
              setReportOpen(true);
            }}
            onDismiss={() => void engine?.discard(refused.id)}
          />
        ) : null}

        {/*
          ⚠️ EXACTLY ONE DISC IS FILLED (rule 2), and its GLOW is what marks it
          primary — not its size and not its position. That is what lets the
          primary MOVE (④ offers *Start the rest*) without the row re-flowing.

          ⚠️ EVERY DISC CARRIES A LABEL (rule 3). Icons never carry meaning
          alone, least of all on a card used in gloves in the dark.

          ⚠️ AND CLOCKED OUT IS A PILL, NOT A ROW OF ONE. A single filled disc
          beside two quiet ones makes the act of starting the day look like a
          choice among three; the shift has not begun, so there is exactly one
          thing to do and the card should say so at full width. Once the clock
          is running there are four real jobs and the row is right.
        */}
        {live || resting || st.kind === 'unconfirmed' ? (
          <DiscRow style={{ marginTop: amazen.space(5) }}>
            {shiftDiscs({
              st, t, live, resting, working, entryId, unread, router, onSetRealTime,
              startRest, endRest, setClockOutAt, setBreakOpen, setReportOpen, setListOpen,
            })}
          </DiscRow>
        ) : (
          <Pressable
            onPress={askMore ? onAskMoreTime : clockIn.openClockInModal}
            disabled={working}
            accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: amazen.space(5),
              paddingVertical: amazen.space(3.5),
              alignItems: 'center',
              borderRadius: amazen.radius.full,
              backgroundColor: c.accentSolid,
              opacity: working ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
              {askMore
                ? t('shiftClock.askMoreTime', { defaultValue: 'Ask for more time' })
                : refusedCopy?.canClockInNow
                ? t('shiftClock.refused.clockInNow', { defaultValue: 'Clock in now' })
                : st.kind === 'done'
                  ? t('shiftClock.clockInAgain', { defaultValue: 'Clock in again' })
                  : t('home.fullTime.clockIn')}
            </AText>
          </Pressable>
        )}
        {askMore ? (
          <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', marginTop: amazen.space(2) }}>
            {t('shiftClock.askMoreTimeHint', { defaultValue: 'Your leader is asked. You can clock in once they agree.' })}
          </AText>
        ) : null}
      </CardSurface>

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
