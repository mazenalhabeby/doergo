/**
 * An event's span as a form holds it: a start and an end, each a day and a time, and the duration
 * worked out from the two — never typed. A flight of 20 hours is "Fri 22:00 → Sat 18:00", not a
 * duration picked from a list that stopped at two hours. Web and phone read the same rule.
 */
import { EVENT_MAX_DURATION_DAYS } from './types';

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` + `HH:MM` as a local instant. */
export function localInstant(day: string, time: string): Date {
  return new Date(`${day}T${time}:00`);
}

/** Whole minutes from start to end (negative when the end is before the start). */
export function spanMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

export type SpanProblem = 'END_BEFORE_START' | 'TOO_LONG';

/** What is wrong with a span, or null. Mirrors the server: it must end after it starts, ≤ 14 days. */
export function spanProblem(start: Date, end: Date): SpanProblem | null {
  if (!(end.getTime() > start.getTime())) return 'END_BEFORE_START';
  if (end.getTime() - start.getTime() > EVENT_MAX_DURATION_DAYS * DAY_MS) return 'TOO_LONG';
  return null;
}

/** Moving the start carries the end with it, so the duration someone set is kept. */
export function moveEndWithStart(oldStart: Date, oldEnd: Date, newStart: Date): Date {
  const keep = Math.max(oldEnd.getTime() - oldStart.getTime(), 0);
  return new Date(newStart.getTime() + keep);
}

/** A duration as days / hours / minutes, for "1 d 4 h 30 min". */
export function durationParts(minutes: number): { days: number; hours: number; minutes: number } {
  const m = Math.max(0, Math.round(minutes));
  return { days: Math.floor(m / 1440), hours: Math.floor((m % 1440) / 60), minutes: m % 60 };
}

/** "1 d 4 h 30 min" in the reader's language — each app passes its own `t` (keys calendar.dur*). */
export function durationText(minutes: number, t: (key: string, opts: { n: number }) => string): string {
  const p = durationParts(minutes);
  const out = [
    p.days ? t('calendar.durDays', { n: p.days }) : '',
    p.hours ? t('calendar.durHours', { n: p.hours }) : '',
    p.minutes ? t('calendar.durMinutes', { n: p.minutes }) : '',
  ].filter(Boolean);
  return out.length ? out.join(' ') : t('calendar.durMinutes', { n: 0 });
}
