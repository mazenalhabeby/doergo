import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TimeEntry } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { attendanceApi } from '../../lib/api/attendance';
import { AText, Chip, ChoicePill, Well, WellDivider, SectionLabel } from '../../components/amazen';
import { JobSheet } from '../job/job-ui';
import { WorkLogSheet } from '../worklog/worklog-sheet';
import { DateTileRow } from './date-tile-row';
import { addDays, dayKey, statusOf } from './time-logic';
import { formatDuration, labelWord, sortedLabels } from '@hbcfield/shared/client';
import { LoadingLine } from '../../components/loading-line';

/** Made (in part) by the automatic clock — marked, never suspected (attendance/auto-clock.ts). */
const AUTOMATIC = new Set(['AUTO_CLOCK_IN', 'AUTO_CLOCK_OUT', 'AUTO_REST']);
/** The first automatic label on the entry (catalogue order), or null — the worker sees only how it was made. */
const automaticLabel = (e: TimeEntry) => sortedLabels(e.flagReasons).find((l) => AUTOMATIC.has(l.code))?.code ?? null;

/** Counted minutes on one entry — the figure payroll reads, never called "paid". */
const countedOf = (e: TimeEntry) => e.paidMinutes ?? e.totalMinutes ?? 0;

type Period = 'week' | 'lastWeek' | 'month';

/**
 * RECENT SHIFTS — the last three, each with its work log one tap away.
 *
 * "See all" opens every shift in a period, fetched when asked: the page itself
 * never loads more than the three it shows.
 */
export function TimeHistory({ entries, now }: { entries: readonly TimeEntry[]; now: Date }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<TimeEntry | null>(null);
  const recent = entries.filter((e) => !!e.clockOutAt).slice(0, 3);

  return (
    <Well style={{ padding: amazen.space(3.5), gap: amazen.space(1) }}>
      <SectionLabel style={{ marginBottom: amazen.space(1) }}>{t('time.history.title', 'Recent shifts')}</SectionLabel>
      {recent.length === 0 ? (
        <AText variant="caption" tone="muted" style={{ paddingVertical: amazen.space(2) }}>
          {t('time.history.empty', 'Your finished shifts show here.')}
        </AText>
      ) : (
        recent.map((e, i) => (
          <React.Fragment key={e.id}>
            {i > 0 ? <WellDivider /> : null}
            <ShiftRow entry={e} onPress={() => setOpen(e)} />
          </React.Fragment>
        ))
      )}
      <Pressable
        onPress={() => setAll(true)}
        accessibilityRole="button"
        hitSlop={6}
        style={{ alignSelf: 'center', paddingTop: amazen.space(2) }}
      >
        <AText variant="caption" tone="accent" style={{ fontSize: 13.5 }}>
          {t('time.history.all', 'See all shifts')}
        </AText>
      </Pressable>

      <AllShiftsSheet
        visible={all}
        onClose={() => setAll(false)}
        now={now}
        onOpen={(e) => {
          setAll(false);
          setOpen(e);
        }}
      />

      {open ? (
        <WorkLogSheet
          visible
          onClose={() => setOpen(null)}
          timeEntryId={open.id}
          shift={{
            workspace: open.location?.name ?? null,
            clockInAt: open.clockInAt,
            clockOutAt: open.clockOutAt,
            tz: open.timezone ?? open.location?.timezone ?? null,
            countedMinutes: countedOf(open),
            approval: open.approvalStatus,
          }}
        />
      ) : null}
    </Well>
  );
}

/** One shift: its day, where and when, how many notes — and what was counted and whether it is approved. */
function ShiftRow({ entry, onPress }: { entry: TimeEntry; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const { formatClock: formatTime } = useTimeFormat();
  const tz = entry.timezone ?? entry.location?.timezone ?? undefined;
  const day = new Date(entry.clockInAt);
  const notes = entry._count?.workLog ?? 0;
  const status = statusOf(entry);
  const statusColor =
    status === 'approved' ? c.accent : status === 'rejected' || status === 'closedForYou' ? c.critical : c.warn;
  return (
    <DateTileRow
      onPress={onPress}
      tileTop={day.toLocaleDateString(i18n.language, { day: 'numeric', timeZone: tz })}
      tileBottom={day.toLocaleDateString(i18n.language, { weekday: 'short', timeZone: tz })}
      trailing={
        <View style={{ alignItems: 'flex-end' }}>
          <AText variant="body" tone="strong" numeric style={{ fontSize: 14, lineHeight: 20 }}>
            {formatDuration(countedOf(entry))}
          </AText>
          <AText variant="caption" numberOfLines={1} style={{ color: statusColor }}>
            {t(`time.history.status.${status}`)}
          </AText>
        </View>
      }
    >
      <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14, lineHeight: 20 }}>
        {entry.location?.name ?? t('attendance.unknownLocation')}
      </AText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
        <AText variant="caption" tone="muted" numeric numberOfLines={1} style={{ flexShrink: 1 }}>
          {`${formatTime(entry.clockInAt, tz)} → ${entry.clockOutAt ? formatTime(entry.clockOutAt, tz) : '…'}`}
        </AText>
        {automaticLabel(entry) ? <Chip label={labelWord(automaticLabel(entry)!, i18n.language)} /> : null}
      </View>
      <AText variant="caption" numberOfLines={1} style={{ color: notes ? c.accent : c.inkMuted, marginTop: 2 }}>
        {notes
          ? t('worklog.count', { count: notes, defaultValue: '{{count}} notes' })
          : t('worklog.nothing', 'Nothing noted')}
      </AText>
    </DateTileRow>
  );
}

function rangeOf(p: Period, now: Date): [Date, Date] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  if (p === 'week') return [monday, addDays(monday, 7)];
  if (p === 'lastWeek') return [addDays(monday, -7), monday];
  return [new Date(now.getFullYear(), now.getMonth(), 1), addDays(today, 1)];
}

function AllShiftsSheet({
  visible,
  onClose,
  now,
  onOpen,
}: {
  visible: boolean;
  onClose: () => void;
  now: Date;
  onOpen: (e: TimeEntry) => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('week');
  const [rows, setRows] = useState<TimeEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (p: Period) => {
      setRows(null);
      setFailed(false);
      const [from, to] = rangeOf(p, now);
      try {
        const res = await attendanceApi.getHistory({
          startDate: dayKey(from),
          endDate: dayKey(to),
          limit: 100,
          page: 1,
        });
        // ⚠️ A BARE ARRAY once unwrapped, whatever the declared type — see `attendanceApi.getHistory`.
        const list: TimeEntry[] = Array.isArray(res) ? (res as unknown as TimeEntry[]) : (res?.data ?? []);
        setRows(list.filter((e) => !!e.clockOutAt));
      } catch {
        setFailed(true);
        setRows([]);
      }
    },
    [now],
  );

  useEffect(() => {
    if (visible) void load(period);
  }, [visible, period, load]);

  const total = (rows ?? []).reduce((a, e) => a + countedOf(e), 0);
  const approved = (rows ?? []).filter((e) => statusOf(e) === 'approved').length;
  const waiting = (rows ?? []).filter((e) => statusOf(e) === 'waiting').length;

  return (
    <JobSheet visible={visible} onClose={onClose} title={t('time.history.sheetTitle', 'Your shifts')}>
      <View style={{ flexDirection: 'row', gap: amazen.space(1.5) }}>
        {(['week', 'lastWeek', 'month'] as const).map((p) => {
          const on = p === period;
          return <ChoicePill key={p} label={t(`time.history.period.${p}`)} on={on} onPress={() => setPeriod(p)} />;
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
        {[
          [formatDuration(total), t('time.week.counted', 'counted')],
          [String(approved), t('time.history.status.approved')],
          [String(waiting), t('time.history.status.waiting')],
        ].map(([v, l]) => (
          <View
            key={l}
            style={{
              flex: 1,
              borderRadius: 14,
              backgroundColor: c.tile,
              paddingVertical: amazen.space(2.25),
              paddingHorizontal: amazen.space(2.5),
            }}
          >
            <AText variant="body" tone="strong" numeric style={{ fontSize: 18, lineHeight: 24 }}>
              {rows ? v : '—'}
            </AText>
            <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 10.5 }}>
              {l}
            </AText>
          </View>
        ))}
      </View>

      {rows === null ? (
        <LoadingLine />
      ) : failed ? (
        <AText variant="caption" tone="critical">
          {t('time.history.failed', 'Could not load your shifts. Try again in a moment.')}
        </AText>
      ) : rows.length === 0 ? (
        <AText variant="caption" tone="muted">
          {t('time.history.none', 'No finished shifts in this period.')}
        </AText>
      ) : (
        <View>
          {rows.map((e, i) => (
            <React.Fragment key={e.id}>
              {i > 0 ? <WellDivider /> : null}
              <ShiftRow entry={e} onPress={() => onOpen(e)} />
            </React.Fragment>
          ))}
        </View>
      )}
      <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
        {t('time.history.closedHint', '“Closed for you” means the shift was left running and was closed for you.')}
      </AText>
    </JobSheet>
  );
}
