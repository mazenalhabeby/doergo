import { useCallback, useMemo, useState } from 'react';
import type { CalendarItem, CalendarItemKind, DayKind } from '@hbcfield/shared/client';
import type { AmazenColors } from '../../theme/amazen';
import { calendarApi, type CalendarRange } from '../../lib/api';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import i18n from '../../i18n';

/** Local day key, YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fromKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
export function mondayOf(d: Date): Date {
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
}

/** One colour per kind — the web's hues, softened for the dark ground and deepened for light. */
export function kindColor(kind: CalendarItemKind, c: AmazenColors, isDark: boolean): string {
  switch (kind) {
    case 'job': return isDark ? '#7cb4ff' : '#2563eb';
    case 'event':
    case 'reminder': return isDark ? '#c4b5fd' : '#7c3aed';
    case 'crm': return isDark ? '#f0abfc' : '#c026d3';
    case 'shift': return c.accent;
    case 'leave': return c.warn;
    case 'holiday': return c.critical;
    default: return c.inkMuted;
  }
}

/** Items touching a day: all-day first, then by start. */
export function itemsOn(items: CalendarItem[], key: string): CalendarItem[] {
  return items
    .filter((i) => (i.allDay ? i.start <= key && i.end >= key : dayKey(new Date(i.start)) <= key && dayKey(new Date(new Date(i.end).getTime() - 1)) >= key))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.start < b.start ? -1 : 1));
}

/** One week of the member's calendar, refreshed on focus and every two minutes; kept offline by the client. */
export function useCalendarWeek(monday: Date) {
  const [data, setData] = useState<CalendarRange | null>(null);
  const [failed, setFailed] = useState(false);
  const from = dayKey(monday), to = dayKey(addDays(monday, 6));
  const load = useCallback(async () => {
    try {
      const r = await calendarApi.range({ from, to, lang: (i18n.language || 'en').slice(0, 2) });
      setData(r);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [from, to]);
  useLiveRefresh(load, 120_000);
  const kinds = useMemo(() => new Map<string, DayKind>((data?.days ?? []).map((d) => [d.day, d.kind])), [data]);
  return { data: data && data.from === from ? data : null, kinds, failed, reload: load };
}
