import React, { useMemo } from 'react';
import { useNow } from '../../hooks/use-now';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  departureAdvice, straightLineTravel, haversineDistance, type TravelEstimate,
} from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { Banner } from '../../components/amazen';

/**
 * The lines between the title and the facts — `.banner` in the mockup. Each
 * appears only when it has something to say, so a banner means something.
 */
export function JobBanners({
  doer,
  status,
  dueDate,
  taskLat,
  taskLng,
  here,
  arrived,
  arrivedLabel,
  onArrived,
  arrivedBusy,
  blockedReason,
  futureLine,
}: {
  doer: boolean;
  status: string;
  dueDate?: string | null;
  taskLat?: number | null;
  taskLng?: number | null;
  here: { lat: number; lng: number } | null;
  /** The phone noticed the member reach the site. */
  arrived: boolean;
  /** The workflow's word for the arrival step, when the flow has one. */
  arrivedLabel: string | null;
  onArrived: () => void;
  arrivedBusy: boolean;
  /** `undefined` = not blocked; `null` = blocked with no reason known yet. */
  blockedReason: string | null | undefined;
  /** "Scheduled for …" — the job cannot be started before its day. */
  futureLine: string | null;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const gap = { gap: amazen.space(2) };
  const atSite = status === 'ARRIVED' || status === 'IN_PROGRESS';
  return (
    <View style={gap}>
      {doer ? <LeaveBy dueDate={dueDate} taskLat={taskLat} taskLng={taskLng} here={here} atSite={atSite} /> : null}
      {doer && arrived && status === 'EN_ROUTE' ? (
        <Banner
          tone="accent"
          text={t('job.arrivedBanner')}
          action={arrivedLabel ? { label: arrivedLabel, onPress: onArrived, disabled: arrivedBusy } : undefined}
        />
      ) : null}
      {blockedReason !== undefined ? (
        <Banner tone="warn" text={blockedReason ? t('job.blockedBanner', { reason: blockedReason }) : t('job.blockedNoReason')} />
      ) : null}
      {doer && futureLine ? <Banner tone="warn" text={futureLine} /> : null}
    </View>
  );
}

/**
 * "Leave by 09:05 · about 18 min drive" — the same advice `BeThereCard` gives
 * (`departureAdvice`, from the phone's own position, no request), in one line.
 * Nothing for a job with no hour or on another day.
 */
function LeaveBy({ dueDate, taskLat, taskLng, here, atSite }: {
  dueDate?: string | null;
  taskLat?: number | null;
  taskLng?: number | null;
  here: { lat: number; lng: number } | null;
  atSite: boolean;
}) {
  const { t } = useTranslation();
  const { formatTime } = useTimeFormat();
  const nowMs = useNow(60_000);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const estimate: TravelEstimate = useMemo(() => {
    if (here && taskLat != null && taskLng != null) return straightLineTravel(haversineDistance(here.lat, here.lng, taskLat, taskLng));
    return { seconds: 0, source: 'unknown' };
  }, [here, taskLat, taskLng]);
  const advice = departureAdvice({ now, appointment: dueDate ? new Date(dueDate) : null, travel: estimate, atSite });
  if (advice.state === 'no-time' || advice.state === 'not-today' || advice.state === 'arrived') return null;

  // The phone's own clock, as the rest of the page reads it.
  const time = (d: Date) => formatTime(d, null);
  const drive = estimate.source !== 'unknown' ? t('job.leave.drive', { count: Math.max(1, Math.round(estimate.seconds / 60)) }) : null;
  const line = (() => {
    switch (advice.state) {
      case 'go': return t('tasks.beThere.go');
      case 'late': return t('tasks.beThere.late', { time: advice.arriveAt ? time(advice.arriveAt) : '', count: advice.lateByMinutes });
      case 'soon': return t('tasks.beThere.soon', { count: advice.minutesUntilLeave ?? 0 });
      default:
        return advice.leaveAt
          ? t('tasks.beThere.plenty', { time: time(advice.leaveAt) })
          : t('tasks.beThere.title', { time: dueDate ? time(new Date(dueDate)) : '' });
    }
  })();
  return (
    <Banner
      tone={advice.state === 'late' ? 'warn' : 'accent'}
      text={drive && advice.state !== 'late' ? `${line} · ${drive}` : line}
    />
  );
}
