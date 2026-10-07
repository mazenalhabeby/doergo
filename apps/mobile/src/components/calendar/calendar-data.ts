import { useCallback, useEffect, useMemo, useState } from 'react';
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

export type CalendarView = 'day' | 'three' | 'month' | 'list';

/** Pages read this session, newest last — bounded, so a long swipe never grows memory. */
const PAGES = new Map<string, CalendarRange>();
const PAGE_MAX = 24;
const pageKey = (from: string, to: string, spaceId: string | null, layers: string, lang: string) => `${from}|${to}|${spaceId ?? ''}|${layers}|${lang}`;
function remember(key: string, r: CalendarRange) {
  PAGES.delete(key);
  PAGES.set(key, r);
  if (PAGES.size > PAGE_MAX) PAGES.delete(PAGES.keys().next().value as string);
}
/** After a write the cached pages are stale: drop them so the next look reads fresh. */
export function forgetCalendarPages() { PAGES.clear(); }

/** First day of the month grid (Monday on or before the 1st) — always 6 weeks, so the grid never jumps. */
export function monthGridStart(anchor: Date): Date {
  return mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
}

/** The days a view shows, from its anchor. */
export function viewRange(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  const d0 = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (view === 'day') return { from: d0, to: d0 };
  if (view === 'three') return { from: d0, to: addDays(d0, 2) };
  if (view === 'month') { const s = monthGridStart(anchor); return { from: s, to: addDays(s, 41) }; }
  return { from: d0, to: addDays(d0, 30) };
}

/** The anchor one page back or forward. */
export function stepAnchor(view: CalendarView, anchor: Date, dir: -1 | 1): Date {
  if (view === 'day') return addDays(anchor, dir);
  if (view === 'three') return addDays(anchor, 3 * dir);
  if (view === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return addDays(anchor, 31 * dir);
}

/**
 * The calendar for what is on screen — ONE read per range (the web's endpoint), refreshed on focus
 * and every two minutes, kept by the client for offline viewing. The neighbouring pages are read
 * in the background once this one has arrived, so swiping to them is instant from the cache.
 */
export function useCalendarRange(view: CalendarView, anchor: Date, spaceId: string | null, layers: string[] | null) {
  const { from, to } = viewRange(view, anchor);
  const f = dayKey(from), tt = dayKey(to);
  const lang = (i18n.language || 'en').slice(0, 2);
  const layerKey = layers ? layers.join(',') : '';
  const key = pageKey(f, tt, spaceId, layerKey, lang);
  const [data, setData] = useState<CalendarRange | null>(() => PAGES.get(key) ?? null);
  const [failed, setFailed] = useState(false);
  // A page already read (or prefetched) is drawn at once; the read below refreshes it.
  useEffect(() => { const hit = PAGES.get(key); if (hit) setData(hit); }, [key]);
  const load = useCallback(async () => {
    try {
      const r = await calendarApi.range({ from: f, to: tt, spaceId, layers: layers ?? undefined, lang });
      remember(key, r);
      setData(r);
      setFailed(false);
    } catch {
      setFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layerKey stands for layers
  }, [f, tt, spaceId, layerKey, lang]);
  useLiveRefresh(load, 120_000);
  useEffect(() => {
    if (!data || data.from !== f) return;
    const timer = setTimeout(() => {
      for (const dir of [1, -1] as const) {
        const n = viewRange(view, stepAnchor(view, anchor, dir));
        const nf = dayKey(n.from), nt = dayKey(n.to), nk = pageKey(nf, nt, spaceId, layerKey, lang);
        if (PAGES.has(nk)) continue;
        calendarApi.range({ from: nf, to: nt, spaceId, layers: layers ?? undefined, lang }).then((r) => remember(nk, r)).catch(() => undefined);
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrived page
  }, [data]);
  const kinds = useMemo(() => new Map<string, DayKind>((data?.days ?? []).map((d) => [d.day, d.kind])), [data]);
  return { data: data && data.from === f ? data : null, kinds, failed, reload: load, from, to };
}

/**
 * Timed items of one day laid out side by side where they overlap: each gets a column and the
 * number of columns in its cluster. Greedy, in start order — a day holds a handful, not hundreds.
 */
export function layoutDay(items: CalendarItem[], key: string): { item: CalendarItem; startMin: number; endMin: number; col: number; cols: number }[] {
  const dayStart = fromKey(key).getTime();
  const rows = items
    .filter((i) => !i.allDay)
    .map((i) => ({
      item: i,
      startMin: Math.max(0, (new Date(i.start).getTime() - dayStart) / 60000),
      endMin: Math.min(1440, (new Date(i.end).getTime() - dayStart) / 60000),
    }))
    .filter((r) => r.endMin > 0 && r.startMin < 1440)
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: { item: CalendarItem; startMin: number; endMin: number; col: number; cols: number }[] = [];
  let cluster: typeof out = [];
  let clusterEnd = -1;
  const flush = () => { const n = Math.max(1, ...cluster.map((c) => c.col + 1)); cluster.forEach((c) => { c.cols = n; }); out.push(...cluster); cluster = []; };
  for (const r of rows) {
    if (r.startMin >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.endMin > r.startMin).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...r, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, r.endMin);
  }
  if (cluster.length) flush();
  return out;
}
