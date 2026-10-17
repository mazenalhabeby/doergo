import React, { useEffect, useRef } from 'react';
import { Animated as RNAnimated, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { daysLate } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { SyncChip } from '../../offline/components/sync-chip';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { weekdayName } from '../../lib/app-dates';
import type { ScheduleEntry, Task } from '../../lib/api/types';
import { AText, Eyebrow, WellDivider } from '../amazen';
import { LinearGradient } from 'expo-linear-gradient';
import { weekOf, sameDay, hasHour, shiftOn, shiftHours, figuresFor } from './my-work';

/** MyWorkCard's module-level helpers, moved here unchanged so its sections can read them too. */
/* ---------------- parts ---------------- */

/**
 * The first open job of the day, WHEN IT IS THE READER'S OWN — raised one step
 * out of the well and carrying its decision.
 */
export function ActiveRow({ task, label, clock, onOpen }: { task: Task; label: string; clock: (d: string) => string; onOpen: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  /*
    A short fade as focus lands. ⚠️ OPACITY ONLY — a Reanimated LAYOUT
    animation corrupted the home column on Android (mobile-cross-platform-traps).
  */
  const fade = useRef(new RNAnimated.Value(0.35)).current;
  useEffect(() => { RNAnimated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start(); }, [fade]);

  const late = daysLate(task.dueDate ?? null) ?? 0;
  const meta = [
    late > 0
      ? t('myWork.late', { count: late, defaultValue: `${late} days late` })
      : hasHour(task.dueDate) ? clock(task.dueDate!) : null,
    task.locationAddress,
    (task as unknown as { space?: { name?: string } }).space?.name,
  ].filter(Boolean).join(' · ');
  const open = t('myWork.openJob', { defaultValue: 'Open the job' });

  return (
    <RNAnimated.View style={{ opacity: fade, backgroundColor: c.tile, borderRadius: 20, padding: amazen.space(3.5), gap: 4, marginVertical: amazen.space(1) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: late > 0 ? c.warn : c.accent }} />
        <Eyebrow tone={late > 0 ? 'warn' : 'muted'} style={{ flexShrink: 1 }}>{label}</Eyebrow>
        <SyncChip entityId={task.id} />
      </View>
      <AText variant="h3" tone="strong" numberOfLines={2}>{task.title}</AText>
      {meta ? <AText variant="caption" tone="muted" numberOfLines={1}>{meta}</AText> : null}

      {/* ⚠️ The lift sits on a wrapper: `overflow: hidden` on the pill would clip its own shadow on iOS. */}
      <View style={{ marginTop: amazen.space(2.5), borderRadius: amazen.radius.full, backgroundColor: c.accentSolid, shadowColor: c.accentSolid, shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${open}: ${task.title}`}
          style={({ pressed }) => ({ borderRadius: amazen.radius.full, overflow: 'hidden', opacity: pressed ? 0.88 : 1 })}>
          <LinearGradient
            colors={amazen.gradient.primary as unknown as [string, string, ...string[]]}
            style={{ minHeight: amazen.layout.tapMin + 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: amazen.space(4) }}
          >
            <AText variant="body" tone="accentInk" style={{ fontFamily: amazen.type.h3.fontFamily }}>{open}</AText>
          </LinearGradient>
        </Pressable>
      </View>
    </RNAnimated.View>
  );
}

export function PlainRow({ task, done, mine, clock, onPress }: { task: Task; done: boolean; mine: boolean; clock: (d: string) => string; onPress: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const who = !mine && task.assignedTo ? task.assignedTo.firstName : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2.5), paddingVertical: amazen.space(2), opacity: pressed ? 0.7 : 1 })}
    >
      {/* Solid = yours, hollow ring = somebody else's. */}
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: mine || !who ? (done ? c.inkMuted : c.accent) : 'transparent', borderWidth: mine || !who ? 0 : 1.5, borderColor: c.inkMuted }} />
      <AText variant="body" tone={done ? 'muted' : 'strong'} numberOfLines={1} style={{ flex: 1, textDecorationLine: done ? 'line-through' : 'none' }}>
        {who ? <AText variant="body" tone="muted">{who} · </AText> : null}
        {task.title}
      </AText>
      <SyncChip entityId={task.id} />
      <AText variant="caption" tone="muted" numeric>
        {done
          ? t('myWork.done', { defaultValue: 'done' })
          : (daysLate(task.dueDate ?? null) ?? 0) > 0
            ? t('myWork.late', { count: daysLate(task.dueDate ?? null), defaultValue: 'late' })
            : hasHour(task.dueDate) ? clock(task.dueDate!) : ''}
      </AText>
    </Pressable>
  );
}

/** Clock-only: the active row IS the shift, and the week's other shifts sit under it. */
export function ShiftList({ schedule, selected, today, live, onOpen }: {
  schedule: ScheduleEntry[];
  selected: Date;
  today: Date;
  live: { clockInAt?: string; location?: { name?: string } | null } | null | undefined;
  onOpen: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatTime } = useTimeFormat();
  const c = amazen.color;
  const sel = shiftOn(schedule, selected);
  const week = weekOf(today);
  const others = week.filter((d) => !sameDay(d, selected) && shiftOn(schedule, d));
  return (
    <>
      <Pressable onPress={onOpen} accessibilityRole="button" style={{ backgroundColor: c.tile, borderRadius: 20, padding: amazen.space(3.5), gap: 4 }}>
        {live ? (
          <>
            <Eyebrow tone="accent">{t('myWork.onTheClock', { defaultValue: 'On the clock' })}</Eyebrow>
            <AText variant="h3" tone="strong">{live.location?.name ?? t('myWork.shift', { defaultValue: 'Shift' })}</AText>
            <AText variant="caption" tone="muted" numeric>
              {live.clockInAt ? t('myWork.since', { time: formatTime(live.clockInAt), defaultValue: `since ${formatTime(live.clockInAt)}` }) : ''}
              {sel ? ` · ${sel.startTime} → ${sel.endTime}` : ''}
            </AText>
          </>
        ) : sel ? (
          <>
            <Eyebrow tone="muted">{t('myWork.shift', { defaultValue: 'Shift' })}</Eyebrow>
            <AText variant="h3" tone="strong" numeric>{sel.startTime} → {sel.endTime}</AText>
            <AText variant="caption" tone="muted">{t('myWork.hours', { count: shiftHours(sel), defaultValue: `${shiftHours(sel)} h` })}</AText>
          </>
        ) : (
          <AText variant="body" tone="muted">
            {t('myWork.noShift', { day: weekdayName(selected, 'long'), defaultValue: `No shift on ${weekdayName(selected, 'long')}.` })}
          </AText>
        )}
      </Pressable>
      {others.map((d, i) => {
        const e = shiftOn(schedule, d)!;
        return (
          <React.Fragment key={d.toISOString()}>
            {i > 0 ? <WellDivider /> : null}
            <Pressable onPress={onOpen} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2.5), paddingVertical: amazen.space(2) }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: d < today ? c.inkMuted : c.accent }} />
              <AText variant="body" tone="strong" style={{ flex: 1 }}>{weekdayName(d, 'long')}</AText>
              <AText variant="caption" tone="muted" numeric>{e.startTime} → {e.endTime}</AText>
            </Pressable>
          </React.Fragment>
        );
      })}
    </>
  );
}

/** Org-wide: reach changes the FORM, not the length. */
export function Figures({ others, open, onPress }: { others: Task[]; open: (t: Task) => boolean; onPress: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const f = figuresFor(others, open);
  const cell = (n: number, label: string, tone: 'strong' | 'critical' | 'warn') => (
    <View style={{ flex: 1 }}>
      <AText variant="decimal" tone={n > 0 ? tone : 'muted'} numeric>{n}</AText>
      <AText variant="caption" tone="muted">{label}</AText>
    </View>
  );
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ gap: amazen.space(2), marginTop: amazen.space(2) }}>
      <Eyebrow tone="muted">{t('myWork.across', { count: f.sites, defaultValue: `Across ${f.sites} sites` })}</Eyebrow>
      <View style={{ flexDirection: 'row' }}>
        {cell(f.open, t('myWork.open', { defaultValue: 'open' }), 'strong')}
        {cell(f.urgent, t('myWork.urgent', { defaultValue: 'urgent' }), 'critical')}
        {cell(f.unassigned, t('myWork.nobodyOn', { defaultValue: 'nobody on' }), 'warn')}
      </View>
    </Pressable>
  );
}

export function Sentence({ title, body, tone = 'strong', children }: { title: string; body?: string; tone?: 'strong' | 'critical' | 'warn'; children?: React.ReactNode }) {
  return (
    <View style={{ gap: 2, paddingVertical: 4 }}>
      <AText variant="body" tone={tone} style={{ fontWeight: '500' }}>{title}</AText>
      {body ? <AText variant="caption" tone="muted">{body}</AText> : null}
      {children}
    </View>
  );
}

export type T = (k: string, o?: Record<string, unknown>) => string;

export function dayEyebrow(d: Date, today: Date, t: T): string {
  if (sameDay(d, today)) return t('common.today', { defaultValue: 'Today' });
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, tomorrow)) return t('common.tomorrow', { defaultValue: 'Tomorrow' });
  return weekdayName(d, 'long');
}

/** `clock` is the member's own 12/24h time — `toTimeString` ignored it. */
export function nextJobLine(next: Task | null, t: T, clock: (d: Date) => string): string {
  if (!next?.dueDate) return t('myWork.nothingAhead', { defaultValue: 'Nothing else is scheduled yet.' });
  const d = new Date(next.dueDate);
  const day = weekdayName(d, 'long');
  return hasHour(next.dueDate)
    ? t('myWork.nextAt', { day, time: clock(d), defaultValue: `Your next job is ${day} at ${clock(d)}.` })
    : t('myWork.nextOn', { day, defaultValue: `Your next job is ${day}.` });
}

export function siteLabel(theirs: Task[], t: T): string {
  const names = new Set(theirs.map((x) => (x as unknown as { space?: { name?: string } }).space?.name).filter(Boolean));
  const name = names.size === 1 ? [...names][0]! : t('myWork.yourSites', { defaultValue: 'Your sites' });
  return `${name} · ${theirs.length}`;
}
