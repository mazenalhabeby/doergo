import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  REQUEST_LIMITS,
  detectRequest,
  localDateKey,
  type DetectedRequest,
  type RequestKind,
} from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import type { RequestOptions } from '@/lib/api/technicians';
import { useRequestPrecheck } from './use-request-precheck';
import { draftToBody, kindEffectKey, type RequestBody } from './request-model';

export type Picker = 'start' | 'end' | 'startTime' | 'endTime' | null;

/** RequestFormCard's state and handlers — everything before its markup, moved here unchanged. */
export function useRequestFormCard({
  kind,
  options,
  busy,
  onClose,
  onSubmit,
  initial,
  onSuggest,
}: Pick<{
  /** Filled in from a suggestion ("This looks like…"); the member still checks and sends. */
  initial?: { start?: string; end?: string; startTime?: string; endTime?: string; minutes?: number; reason?: string } | null;
  /** "Other" words that read as another kind: the screen switches to it. */
  onSuggest?: (s: DetectedRequest, words: string) => void;
  /** LEAVE never opens here. */
  kind: Exclude<RequestKind, 'LEAVE'>;
  options: RequestOptions | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: RequestBody) => void;
}, 'kind' | 'options' | 'busy' | 'onClose' | 'onSubmit' | 'initial' | 'onSuggest'>) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const today = localDateKey(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [minutes, setMinutes] = useState<number>(60);
  const [reason, setReason] = useState('');
  const [picker, setPicker] = useState<Picker>(null);
  const [tried, setTried] = useState(false);

  const spaces = options?.remoteSpaces ?? [];
  // A fresh form for every kind; one workspace is chosen for the member.
  useEffect(() => {
    setStart(initial?.start && initial.start >= today ? initial.start : today);
    setEnd(initial?.end ?? null);
    setStartTime(initial?.startTime ?? ''); setEndTime(initial?.endTime ?? '');
    setMinutes(
      initial?.minutes
        ? Math.min(REQUEST_LIMITS.OVERTIME_MAX_MINUTES, Math.max(REQUEST_LIMITS.OVERTIME_MIN_MINUTES, initial.minutes))
        : 60,
    );
    setReason(initial?.reason ?? ''); setTried(false);
    setSpaceId(spaces.length === 1 ? spaces[0]!.id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, spaces.length, initial]);

  const range = kind === 'REMOTE' || kind === 'OTHER';
  const built = draftToBody({
    kind, startDate: start, endDate: range ? end : null,
    spaceId: kind === 'REMOTE' ? spaceId : null,
    startTime: kind === 'HOURS' ? startTime || null : null,
    endTime: kind === 'HOURS' ? endTime || null : null,
    minutes: kind === 'OVERTIME' ? minutes : null,
    reason,
  });
  const noSpace = kind === 'REMOTE' && spaces.length === 0;
  // What a leader would check, once the form is complete enough to send.
  const precheck = useRequestPrecheck(built.ok ? (built.body as unknown as Record<string, unknown>) : null);
  // "Other" in words that ask for something the app has a form for.
  const suggestion = useMemo(() => (kind === 'OTHER' && onSuggest ? detectRequest(reason) : null), [kind, reason, onSuggest]);
  const effect = kindEffectKey(kind);
  const dayLabel = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const send = () => {
    setTried(true);
    if (built.ok && !busy) onSubmit(built.body);
  };

  return {
    amazen,
    c,
    t,
    today,
    start,
    setStart,
    end,
    setEnd,
    spaceId,
    setSpaceId,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    minutes,
    setMinutes,
    reason,
    setReason,
    picker,
    setPicker,
    tried,
    spaces,
    range,
    built,
    noSpace,
    precheck,
    suggestion,
    effect,
    dayLabel,
    send,
  };
}
