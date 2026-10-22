import React, { useMemo } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '@hbcfield/shared/client';
import { useMyHandovers } from '@/hooks/use-my-handovers';
import { useShift } from '@/offline/attendance/use-shift';
import { StartWorkGlyph } from '@/components/glyphs/work-glyphs';
import { IssueMineGlyph } from '@/components/glyphs/shift-glyphs';
import { StripBox } from './strip-box';
import { jobsStripItems, jobsStripLines } from './jobs-strip-state';

/**
 * Stopped work, under the home header — the jobs twin of the documents strip.
 *
 * "Write what you did on Boiler check" until it is written, on every open; and,
 * once clocked in again, "You paused Boiler check — resume work". A tap goes
 * STRAIGHT to the job: the note sheet already open for a note, the job (its dock
 * says Resume work) for a pause. No dismiss — it goes when the work is done.
 */
export function JobsStrip() {
  const { t } = useTranslation();
  const router = useRouter();
  const shift = useShift();
  const mine = useMyHandovers();
  const items = useMemo(() => jobsStripItems(mine, !!shift.status?.isClockedIn), [mine, shift.status?.isClockedIn]);
  const lines = jobsStripLines(items);
  if (!mine.ready || !lines) return null;

  const first = items[0]!;
  const open = () => router.push({
    pathname: '/task/[id]',
    params: first.kind === 'owed' ? { id: first.taskId, sheet: 'handover' } : { id: first.taskId },
  } as unknown as Href);

  return (
    <StripBox
      tone={first.kind === 'owed' ? 'warn' : 'calm'}
      Glyph={items.length === 1 ? (first.kind === 'owed' ? IssueMineGlyph : StartWorkGlyph) : undefined}
      count={items.length === 1 ? undefined : items.length}
      title={t(lines.title.k, lines.title.v)}
      sub={t(lines.sub.k, 'minutes' in lines.sub.v ? { time: formatDuration(Number(lines.sub.v.minutes)) } : lines.sub.v)}
      onPress={open}
    />
  );
}
