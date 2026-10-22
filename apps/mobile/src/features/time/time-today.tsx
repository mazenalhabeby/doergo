import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Break, TimeEntry } from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useTimeFormat } from '@/hooks/use-time-format';
import { AText, Well, SectionLabel } from '@/components/amazen';
import { PlusGlyph } from '../job/job-glyphs';
import { ActivityGlyph } from '@/components/glyphs/glyphs';
import { WorkLogSheet } from '../worklog/worklog-sheet';
import { useWorklog } from '../worklog/use-worklog';
import { formatDuration } from '@hbcfield/shared/client';

/**
 * TODAY — the shift as it happened, with its work log on top.
 *
 * Shown from the moment there is something to show: a running shift, or one
 * that ended today. Before the first clock-in there is nothing to tell, and an
 * empty "Today" box would be a second way of saying what the card above says.
 *
 * ⚠️ THE RUNNING SHIFT'S LOG IS FETCHED, A FINISHED ONE'S IS COUNTED. The card
 * shows the last note only for the shift being worked — that is the one a
 * member adds to. A finished shift's count comes with its history row
 * (`_count.workLog`), so reading it costs no request at all.
 */
export function TimeToday({
  running,
  finished,
  breaks,
}: {
  /** The shift on the clock now, if any. */
  running: TimeEntry | null;
  /** Today's finished shift, when nobody is on the clock. */
  finished: TimeEntry | null;
  breaks: readonly Break[];
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { formatClock: formatTime } = useTimeFormat();
  const entry = running ?? finished;
  const [open, setOpen] = useState(false);
  const log = useWorklog(running?.id ?? null, !!running);
  if (!entry) return null;

  const tz = entry.timezone ?? entry.location?.timezone ?? undefined;
  const clock = (iso: string) => formatTime(iso, tz);
  const count = running ? log.notes.length : entry._count?.workLog ?? 0;
  const last = running ? log.notes[log.notes.length - 1] : undefined;

  type Row = { at: string; kind: 'in' | 'rest' | 'out'; title: string; sub: string };
  const rows: Row[] = [];
  const countedFrom =
    entry.countedStartAt && new Date(entry.countedStartAt).getTime() !== new Date(entry.clockInAt).getTime()
      ? t('attendance.countedFrom', { defaultValue: 'Counted from {{time}}', time: clock(entry.countedStartAt) })
      : null;
  rows.push({
    at: entry.clockInAt,
    kind: 'in',
    title: t('time.today.clockedIn', 'Clocked in'),
    sub: [entry.location?.name, entry.isRemote ? t('time.today.away', 'away from a site') : entry.clockInWithinGeofence ? t('time.today.onSite', 'on the site') : t('time.today.offSite', 'outside the site'), countedFrom]
      .filter(Boolean).join(' · '),
  });
  for (const b of breaks.filter((x) => x.timeEntryId === entry.id)) {
    rows.push({
      at: b.startedAt,
      kind: 'rest',
      title: t(`time.today.rest.${b.type}`, { defaultValue: t('time.today.rest.OTHER', 'Rest') }),
      sub: b.endedAt
        ? `${clock(b.startedAt)} – ${clock(b.endedAt)} · ${t('time.today.notCounted', 'not counted')}`
        : t('time.today.restNow', 'now'),
    });
  }
  if (entry.clockOutAt) {
    rows.push({
      at: entry.clockOutAt,
      kind: 'out',
      title: t('time.today.clockedOut', 'Clocked out'),
      sub: t('time.today.counted', {
        defaultValue: '{{time}} counted',
        time: formatDuration(entry.paidMinutes ?? entry.totalMinutes ?? 0),
      }),
    });
  }
  rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return (
    <Well style={{ padding: amazen.space(3.5), gap: amazen.space(3) }}>
      <SectionLabel>{t('time.today.title', 'Today')}</SectionLabel>

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={running ? t('worklog.title', 'What I did today') : t('worklog.titlePast', 'Activity for this shift')}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: amazen.space(3),
          borderRadius: 18, padding: amazen.space(3), backgroundColor: c.tile, opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: c.accentTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <ActivityGlyph size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: amazen.space(2) }}>
            <AText variant="body" tone="strong" style={{ fontSize: 14, lineHeight: 20 }}>
              {running ? t('time.today.whatIDid', 'What I did') : t('worklog.button', 'Activity')}
            </AText>
            <AText variant="caption" tone="muted" numeric>
              {count ? t('worklog.count', { count, defaultValue: '{{count}} notes' }) : t('worklog.nothing', 'Nothing noted')}
            </AText>
          </View>
          <AText variant="caption" tone="ink" numberOfLines={1} style={{ fontSize: 12.5 }}>
            {last
              ? `${clock(last.at)}  ${last.body}`
              : running
                ? t('worklog.tabHint', 'Log what you did today')
                : t('worklog.viewActivity', 'View activity')}
          </AText>
        </View>
        {running ? (
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: c.accentSolid,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <PlusGlyph size={16} color={c.accentInk} />
          </View>
        ) : (
          <AText variant="body" tone="muted">›</AText>
        )}
      </Pressable>

      <View>
        {rows.map((r, i) => (
          <View key={`${r.kind}-${r.at}`} style={{ flexDirection: 'row', gap: amazen.space(2) }}>
            <AText variant="caption" tone="muted" numeric style={{ width: 46, paddingTop: 2 }}>{clock(r.at)}</AText>
            <View style={{ width: 14, alignItems: 'center' }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  marginTop: 4,
                  backgroundColor: r.kind === 'rest' ? c.warn : r.kind === 'out' ? c.inkMuted : c.accent,
                }}
              />
              {i < rows.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: c.lineWell }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: amazen.space(3) }}>
              <AText variant="body" tone="strong" style={{ fontSize: 13.5, lineHeight: 19 }}>{r.title}</AText>
              <AText variant="caption" tone="muted" numberOfLines={2}>{r.sub}</AText>
            </View>
          </View>
        ))}
      </View>

      <WorkLogSheet
        visible={open}
        onClose={() => setOpen(false)}
        timeEntryId={entry.id}
        editable={!!running}
        shift={{
          workspace: entry.location?.name ?? null,
          clockInAt: entry.clockInAt,
          clockOutAt: entry.clockOutAt,
          tz,
          countedMinutes: entry.clockOutAt ? entry.paidMinutes ?? entry.totalMinutes ?? null : null,
          approval: entry.clockOutAt ? entry.approvalStatus : null,
        }}
      />
    </Well>
  );
}
