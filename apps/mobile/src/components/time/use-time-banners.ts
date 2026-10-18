import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { type AttendanceStatus, type BreakStatus, type GeofenceExcursion } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import type { OvertimeRequest } from '../../lib/api';
import { type NoShiftNote } from './time-logic';
import { forgotClockOutOffer } from '../../lib/clock-smart';

/** TimeBanners's state and handlers — everything before its markup, moved here unchanged. */
export function useTimeBanners({
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
}: Pick<{
  status: AttendanceStatus | null;
  breaks: BreakStatus | null;
  watch: {
    outside: { metres: number } | null;
    excursion: GeofenceExcursion | null;
    countdown: string;
    reporting: boolean;
    reportExcursion: (reason: string, minutes: number) => Promise<boolean>;
  };
  overtime: OvertimeRequest | null;
  hasShiftScheduling: boolean;
  busy: boolean;
  /** "I forgot to clock out" — the real leave time. */
  onForgot: (at: Date) => void;
  /** "Ask for more time" — ask a leader. */
  onRequestExtra: () => void;
  onChanged: () => void;
  /** The workspace they are at and its no-shift rule (`noShiftHere` in time-logic) — the only one spoken of. */
  noShiftHere?: NoShiftNote | null;
}, 'status' | 'breaks' | 'watch' | 'overtime' | 'hasShiftScheduling' | 'busy' | 'onForgot' | 'onRequestExtra'
  | 'onChanged' | 'noShiftHere'>) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { formatClock: formatTime } = useTimeFormat();
  const [explain, setExplain] = useState(false);
  const [forgot, setForgot] = useState(false);
  /* "Ask for more time": the small sheet with the amounts. */
  const [moreTime, setMoreTime] = useState(false);
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
  // Approved: the one extra-time line says it with the new end, not a second line beside it.
  const approvedLine = entry && reminder === 'OVERTIME_APPROVED'
    ? (`${t('shiftReminder.extraApprovedTitle')}` +
        `${end ? ` · ${t('shiftReminder.extraApprovedSubtitle', { time: formatTime(end.toISOString(), tz) })}` : ''}`)
    : null;
  const limitLeft = entry?.endIsDailyLimit && end ? Math.ceil((end.getTime() - now.getTime()) / 60_000) : null;
  // "You left the Warehouse at 16:42 — clock out at 16:42?" (lib/clock-smart.ts).
  const leftOffer = entry ? forgotClockOutOffer(entry, now) : null;

  return {
    amazen,
    t,
    router,
    formatTime,
    explain,
    setExplain,
    forgot,
    setForgot,
    setStillWorkingAt,
    entry,
    tz,
    space,
    ex,
    now,
    reminder,
    end,
    unscheduled,
    hoursOpen,
    askEnded,
    approvedLine,
    limitLeft,
    leftOffer,
    moreTime,
    setMoreTime,
  };
}

/** What TimeBanners and its sections read. */
export type TimeBannersState = ReturnType<typeof useTimeBanners>;
