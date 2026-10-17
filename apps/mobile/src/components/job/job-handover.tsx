import React from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDuration, owesHandover, personName } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import type { Task } from '../../lib/api';
import { AText } from '../amazen';
import { Banner, Initials, SectionLabel } from './job-ui';
import type { JobFile } from './job-files';

/**
 * The top of a job somebody stopped (packages/shared/src/tasks/handover.ts):
 *
 *  - the newest handover — who, how long they worked on it, what they wrote and
 *    their photos — so whoever picks the job up starts from where it was left;
 *  - "no handover yet" when the person who stopped has not written one;
 *  - and, to that person, the ask to write it.
 *
 * Renders nothing on a job nobody has stopped.
 */
export function JobHandover({
  task,
  files,
  meId,
  timeOf,
  onWrite,
}: {
  task: Pick<Task, 'pausedAt' | 'pausedById' | 'handoverDueById' | 'pausedBy' | 'handoverDue' | 'handovers'>;
  files: readonly JobFile[];
  meId: string | null | undefined;
  /** A person's share of the job's time, when it has been read (job-time.ts). */
  timeOf?: (userId: string) => { working: number; travel: number } | null;
  onWrite: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatTime, formatDueDate } = useTimeFormat();
  const c = amazen.color;
  const latest = task.handovers?.[0] ?? null;
  const iOwe = owesHandover(task, meId);
  const due = task.handoverDue;
  const name = (p?: { firstName: string; lastName: string } | null) => personName(p);

  const pausedLine = task.pausedAt
    ? task.pausedById === meId
      ? t('job.handover.pausedYou', { time: `${formatDueDate(task.pausedAt)} ${formatTime(task.pausedAt, null)}` })
      : t('job.handover.pausedBy', {
          name: name(task.pausedBy),
          time: `${formatDueDate(task.pausedAt)} ${formatTime(task.pausedAt, null)}`,
        })
    : null;

  if (!latest && !due && !pausedLine) return null;
  const photos = latest ? files.filter((f) => latest.attachmentIds.includes(f.id) && f.fileUrl) : [];

  return (
    <View style={{ gap: amazen.space(2) }}>
      {pausedLine ? <Banner tone="neutral" text={pausedLine} /> : null}

      {iOwe ? (
        <Banner tone="warn" text={t('job.handover.youOwe')} action={{ label: t('job.handover.write'), onPress: onWrite }} />
      ) : due?.user ? (
        <Banner
          tone="warn"
          text={due.workedMinutes
            ? t('job.handover.notYetWorked', { name: name(due.user), time: formatDuration(due.workedMinutes) })
            : t('job.handover.notYet', { name: name(due.user) })}
        />
      ) : null}

      {latest ? (
        <View style={{ backgroundColor: c.tile, borderRadius: amazen.radius.field, padding: amazen.space(3.5), gap: amazen.space(2) }}>
          <SectionLabel tone="accent">{t('job.handover.label')}</SectionLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
            <Initials first={latest.author.firstName} last={latest.author.lastName} size={26} />
            <View style={{ flex: 1 }}>
              <AText variant="caption" tone="strong">{name(latest.author)}</AText>
              <AText variant="caption" tone="muted" numeric style={{ fontSize: 11.5 }}>
                {`${formatDueDate(latest.createdAt)} ${formatTime(latest.createdAt, null)}`}
              </AText>
            </View>
          </View>
          <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>{latest.note}</AText>
          {(() => {
            // "Mike's job time 2h 15m · Travel 22m" — theirs, so the next person's starts at their own Start work.
            const share = timeOf?.(latest.author.id);
            const worked = share?.working ?? latest.workedMinutes ?? 0;
            const parts = [
              worked ? t('job.handover.theirTime', { name: latest.author.firstName, time: formatDuration(worked) }) : null,
              share?.travel ? t('job.handover.travel', { time: formatDuration(share.travel) }) : null,
            ].filter(Boolean);
            return parts.length ? <AText variant="caption" tone="muted" numeric>{parts.join(' · ')}</AText> : null;
          })()}
          {photos.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {photos.map((p) => (
                <Image
                  key={p.id}
                  source={{ uri: p.fileUrl }}
                  style={{ width: 64, height: 64, borderRadius: amazen.radius.tile, marginRight: amazen.space(2) }}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
