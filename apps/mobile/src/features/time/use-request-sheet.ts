import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { addDays, dayKey, daysOff, leaveDays, overlapIn } from './time-logic';
import type { useMyTimeOff } from './use-my-time-off';
import { type LeaveType } from '@hbcfield/shared/client';
import { draftToBody, leaveTypeLabelKey } from '../requests/request-model';
import { useLeaveCost } from '../requests/use-leave-preview';
import { useRangeText } from './time-off-section-shared';

/** RequestSheet's state and handlers — everything before its markup, moved here unchanged. */
export function useRequestSheet({
  visible,
  onClose,
  leave,
  weekdays,
  now,
}: Pick<
  {
    visible: boolean;
    onClose: () => void;
    leave: ReturnType<typeof useMyTimeOff>;
    weekdays: Set<number> | null;
    now: Date;
  },
  'visible' | 'onClose' | 'leave' | 'weekdays' | 'now'
>) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const range = useRangeText();
  const [kind, setKind] = useState<LeaveType>('VACATION');
  const [a, setA] = useState<Date | null>(null);
  const [b, setB] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ a: Date; b: Date; n: number; queued: boolean } | null>(null);
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const taken = useMemo(() => leaveDays(leave.absences), [leave.absences]);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const reset = () => {
    setA(null);
    setB(null);
    setNote('');
    setNoteOpen(false);
    setSent(null);
    setKind('VACATION');
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };
  const close = () => { onClose(); setTimeout(reset, 300); };

  const works = (d: Date) => !weekdays || weekdays.has(d.getDay());
  const pick = (d: Date) => {
    if (taken.has(dayKey(d))) return;
    if (!a || b || d < a) { setA(d); setB(null); return; }
    setB(dayKey(d) === dayKey(a) ? null : d);
  };
  /** The next day this member works, from `from` on. */
  const nextWorking = (from: Date) => { let d = from; for (let i = 0; i < 14 && !works(d); i++) d = addDays(d, 1); return d; };
  const quick = (k: 'tomorrow' | 'nextWeek') => {
    if (k === 'tomorrow') {
      const d = nextWorking(addDays(today, 1));
      setA(d);
      setB(null);
      setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      return;
    }
    const monday = addDays(today, 7 - ((today.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter(works);
    const first = days[0] ?? monday;
    const last = days[days.length - 1] ?? addDays(monday, 4);
    setA(first); setB(dayKey(last) === dayKey(first) ? null : last);
    setMonth(new Date(first.getFullYear(), first.getMonth(), 1));
  };

  const end = b ?? a;
  /*
    What the range COSTS, asked of the server — the one count the request is charged by: the
    workspace's weekend, public holidays and the member's own rota (shared calendar/days.ts).
    Offline, the phone's own count from the working week stands in.
  */
  const { user } = useAuth();
  const cost = useLeaveCost(user?.id, a ? dayKey(a) : null, end ? dayKey(end) : null);
  const costDay = useMemo(() => new Map((cost?.days ?? []).map((d) => [d.day, d])), [cost]);
  const n = cost ? cost.counted : a && end ? daysOff(a, end, weekdays) : 0;
  const clash = a && end ? overlapIn(a, end, taken) : null;
  const kindLabel = t(leaveTypeLabelKey(kind));

  const send = async () => {
    if (!a || !end || clash || busy) return;
    setBusy(true);
    try {
      // The leave type travels as `type`; the note is the note (request-model.ts).
      const built = draftToBody({ kind: 'LEAVE', startDate: dayKey(a), endDate: dayKey(end), type: kind, reason: note });
      if (!built.ok) { toast.error(t('common.error'), t(`offline.errors.${built.code}`)); return; }
      const outcome = await leave.request(built.body);
      if (outcome.kind === 'refused') {
        toast.error(
          t('common.error'),
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
            outcome.message ||
            t('timeOff.requestForm.failedToSubmit'),
        );
        return;
      }
      setSent({ a, b: end, n, queued: outcome.kind === 'queued' });
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('timeOff.requestForm.failedToSubmit'));
    } finally {
      setBusy(false);
    }
  };

  return {
    amazen,
    c,
    t,
    i18n,
    range,
    kind,
    setKind,
    a,
    b,
    note,
    setNote,
    noteOpen,
    setNoteOpen,
    busy,
    sent,
    month,
    setMonth,
    taken,
    today,
    close,
    works,
    pick,
    quick,
    end,
    cost,
    costDay,
    n,
    clash,
    kindLabel,
    send,
  };
}

/** What RequestSheet and its sections read. */
export type RequestSheetState = ReturnType<typeof useRequestSheet>;
