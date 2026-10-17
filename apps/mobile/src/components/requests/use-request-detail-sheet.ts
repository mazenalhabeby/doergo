import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LEAVE_TYPES, formatDuration } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import type { TimeOffRequest } from '../../lib/api';
import { type Tone } from '../job/job-ui';
import { describeRequest, hoursFact, leaveTypeLabelKey, legacyLabelMap } from './request-model';

/** A request as the parts below read it: the server's row, or one still on the phone. */
export type RequestRowData = TimeOffRequest & { pendingSync?: boolean };

/** A day `YYYY-MM-DD…` at noon, local — never shifted across midnight by a zone. */
export const noon = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`);

/**
 * THE WORDS OF A REQUEST — what it is called, its days, where, and how long.
 *
 * One reader for every screen that lists requests (the Requests tab, the Time
 * tab, the manager's queue), so a remote day reads the same in all three.
 */
export function useRequestWords() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  // Old rows carry the leave type in the reason, in whichever language the phone spoke (request-model.ts).
  const legacy = useMemo(
    () =>
      legacyLabelMap(
        LEAVE_TYPES.flatMap((ty) => [[ty, t(leaveTypeLabelKey(ty))], [ty, t(leaveTypeLabelKey(ty), { lng: 'en' })]] as const),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );
  return useMemo(() => {
    const day = (d: string) => noon(d).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });
    const range = (a: string, b: string) => (a.slice(0, 10) === b.slice(0, 10) ? day(a) : `${day(a)} – ${day(b)}`);
    const describe = (r: RequestRowData) => {
      const d = describeRequest(r, legacy);
      return { ...d, title: t(d.titleKey) };
    };
    /** Where and how much — the workspace, the changed hours, the agreed minutes. */
    const details = (r: RequestRowData, spaceName?: string | null): Array<{ label: string; value: string }> => {
      const out: Array<{ label: string; value: string }> = [];
      const space = r.space?.name ?? spaceName;
      if (space) out.push({ label: t('requests.form.workspace', 'Workspace'), value: space });
      const kind = describeRequest(r).kind;
      if (kind === 'HOURS') {
        const f = hoursFact(r.startTime, r.endTime);
        if (f) out.push({ label: t('requests.form.hours', 'Hours'), value: t(f.key, f.values) });
      }
      if (kind === 'OVERTIME' && r.minutes)
        out.push({
          label: t('requests.form.howLong', 'How long'),
          value: t('requests.facts.overtime', { duration: formatDuration(r.minutes) }),
        });
      return out;
    };
    const status = (r: RequestRowData): { label: string; tone: Tone } =>
      r.status === 'APPROVED' ? { label: t('timeOffStatus.APPROVED'), tone: 'accent' }
        : r.status === 'REJECTED' ? { label: t('timeOffStatus.REJECTED'), tone: 'critical' }
          : r.status === 'CANCELED' ? { label: t('timeOffStatus.CANCELED'), tone: 'neutral' }
            : { label: t('timeOffStatus.PENDING'), tone: 'warn' };
    return { day, range, describe, details, status };
  }, [lang, legacy, t]);
}

/** RequestDetailSheet's state and handlers — everything before its markup, moved here unchanged. */
export function useRequestDetailSheet({
  request,
  spaceName,
  onClose,
  onWithdraw,
}: Pick<{
  request: RequestRowData | null;
  spaceName?: string | null;
  onClose: () => void;
  onWithdraw?: (r: RequestRowData) => Promise<void>;
}, 'request' | 'spaceName' | 'onClose' | 'onWithdraw'>) {
  const { amazen } = useTheme();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const w = useRequestWords();
  const [busy, setBusy] = useState(false);

  return {
    amazen,
    t,
    i18n,
    toast,
    w,
    busy,
    setBusy,
  };
}
