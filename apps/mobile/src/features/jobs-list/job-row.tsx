import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useTimeFormat } from '@/hooks/use-time-format';
import { usePendingFor } from '@/offline/offline-context';
import { AText, Pill } from '@/components/amazen';
import { hasHour, sameDay } from '../home/my-work';
import { sameJobRowProps, type JobBand, type RowRight, type RowWho } from './jobs-logic';

/**
 * One job in a well — `jobRow()`: a dot, the title (● when urgent), who and
 * where, and on the right the one fact that matters now (waiting to send,
 * late, done, or when) over the step the job is on.
 *
 * ⚠️ Every line is one line and shrinks rather than wraps: a German step name
 * or a long street must not push the row to two heights in a list of hundreds.
 */
export const JobRow = memo(function JobRow({
  id,
  title,
  urgent,
  band,
  mine,
  closed,
  who,
  place,
  right,
  stepLabel,
  onOpen,
}: {
  /** The job's id — for its changes still on their way (as the old `SyncChip` read them). */
  id: string;
  title: string;
  urgent: boolean;
  band: JobBand;
  mine: boolean;
  closed: boolean;
  who: RowWho;
  place: string | null;
  right: RowRight;
  stepLabel: string;
  /** Stable across renders (the list's `open`), called with this row's id. */
  onOpen: (id: string) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatTime, formatDueDate } = useTimeFormat();
  const c = amazen.color;
  // Anything of this job's the server has not accepted yet — also on rows that came from the server.
  const { waiting, attention } = usePendingFor(id);

  const dot = band === 'blocked' ? c.critical : band === 'overdue' ? c.warn : closed ? c.inkMuted : mine ? c.accent : null;
  const whoText = who == null ? null : who.kind === 'you' ? t('jobsList.you') : who.kind === 'nobody' ? t('jobsList.nobody') : who.name;

  /*
    ⚠️ THE CLOCK IS THE PHONE'S, as on the home card: "today" and the hour are
    read in the phone's zone, and midnight means no hour was given.
  */
  const when = (iso: string) => {
    const d = new Date(iso);
    const time = hasHour(iso) ? formatTime(d, null) : null;
    if (sameDay(d, new Date())) return time ?? t('common.today');
    return time ? `${formatDueDate(d)} ${time}` : formatDueDate(d);
  };

  return (
    <Pressable
      onPress={() => onOpen(id)}
      accessibilityRole="button"
      accessibilityLabel={[title, whoText, place, stepLabel].filter(Boolean).join(', ')}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: amazen.space(3),
        paddingVertical: amazen.space(2.5), paddingHorizontal: 2, borderRadius: 12,
        backgroundColor: pressed ? c.tile : 'transparent',
      })}
    >
      {dot ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: c.inkMuted }} />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <AText
          numberOfLines={1}
          style={{
            fontFamily: amazen.font.sansMedium,
            fontSize: 14,
            lineHeight: 20,
            color: closed ? c.ink : c.inkStrong,
          }}>
          {urgent && !closed ? <AText style={{ color: c.critical, fontSize: 14, lineHeight: 20 }}>{'● '}</AText> : null}
          {title}
        </AText>
        {whoText || place ? (
          <AText variant="caption" numberOfLines={1} style={{ color: c.ink }}>
            {whoText ? <AText variant="caption" style={{ color: who?.kind === 'nobody' ? c.warn : c.ink }}>{whoText}</AText> : null}
            {whoText && place ? ' · ' : ''}
            {place ?? ''}
          </AText>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4, maxWidth: '42%', flexShrink: 0 }}>
        {attention > 0 ? <Pill tone="critical" label={t('offline.chip.attention')} />
          : right.kind === 'pending' || waiting > 0 ? <Pill label={t('offline.chip.waiting')} />
          : right.kind === 'late' ? <Pill tone="warn" label={t('jobsList.late', { count: right.days })} />
          : right.kind === 'done' ? <Pill label={t('jobsList.done')} />
          : right.kind === 'due' ? <AText variant="caption" numeric numberOfLines={1} style={{ color: c.ink }}>{when(right.at)}</AText>
          : null}
        <Pill tone={band === 'doing' ? 'accent' : 'neutral'} label={stepLabel} />
      </View>
    </Pressable>
  );
}, sameJobRowProps);
