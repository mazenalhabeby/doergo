import { useEffect, useMemo, useState } from 'react';
import { useNow } from '@/hooks/use-now';
import { type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useShift } from '@/offline/attendance/use-shift';
import { refusedShiftCopy } from '@/offline/attendance/refused-shift';
import { useRefusedShift } from '@/offline/attendance/use-refused-shift';
import { useOffline } from '@/offline/offline-context';
import { useClockIn } from '@/hooks/use-clock-in';
import { useMyHandovers, useRefreshMyHandovers } from '@/hooks/use-my-handovers';
import { useTimeFormat } from '@/hooks/use-time-format';
import { readShiftState, scheduleFor, totalsRevision } from './shift-state';
import { useScheduleTotals, type ScheduleTotalsView } from './use-schedule-totals';
import { useUnreadIssues } from './use-unread-issues';
import { useShiftClockActions } from './shift-clock/use-shift-clock-actions';
import { useInsideSites } from '@/services/auto-clock/use-inside-sites';
import { useForgotOfferNotice } from '../time/use-forgot-offer';
import type { NoShiftNote } from '../time/time-logic';

export interface ShiftClockCardViewProps {
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
  /** Bumped by a "Clock out" elsewhere on the screen (the shift-ended banner): opens this card's receipt. */
  clockOutRequest?: number;
}

/** ShiftClockCardView's state and handlers — everything before its markup, moved here unchanged. */
export function useShiftClockCardView({
  shift,
  style,
  linkToTime = true,
  onSetRealTime,
  openIssueId,
  totals: given,
  noShift,
  onAskMoreTime,
  clockOutRequest,
}: Pick<
  ShiftClockCardViewProps,
  'shift' | 'style' | 'linkToTime' | 'onSetRealTime' | 'openIssueId' | 'totals' | 'noShift' | 'onAskMoreTime'
  | 'clockOutRequest'
>) {
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

  const insideSpaceIds = useInsideSites();
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
    insideSpaceIds,
    now,
  });

  const refreshHandovers = useRefreshMyHandovers();
  const clockIn = useClockIn({
    assignedLocations: status?.assignedLocations ?? [],
    isClockedIn: !!status?.isClockedIn,
    // Today's shift names the workspace: no picker (lib/clock-smart.ts).
    shiftSpaceId: status?.nextShift?.spaceId ?? null,
    // A clock-in is when a paused job is offered back (the home jobs strip).
    onClockedIn: () => { void refresh(); refreshHandovers(); },
  });

  const entryId = status?.currentEntry?.id;
  useForgotOfferNotice(status?.isClockedIn ? status.currentEntry : null);
  // "Clock out" on the shift-ended banner opens the same receipt as the disc, frozen at that moment.
  useEffect(() => {
    if (clockOutRequest && status?.isClockedIn) setClockOutAt(new Date());
  }, [clockOutRequest]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return {
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
  };
}

/** What ShiftClockCardView and its sections read. */
export type ShiftClockCardViewState = ReturnType<typeof useShiftClockCardView>;
