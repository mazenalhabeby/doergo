import React, { memo, useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CalendarItem, DayKind } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText, Well } from '../amazen';
import { addDays, dayKey, itemsOn, kindColor, layoutDay, monthGridStart } from './calendar-data';

/*
  The calendar's four ways of drawing the same read: Month (a grid + the chosen day), Day and
  3 days (an hour grid), List (what is coming, by day). One item row, one colour per kind (the
  web's), one way to say "rest day" and "holiday" — so the views cannot drift apart.
*/

const HOUR = 52;
const WEEKDAY_KEYS = [1, 2, 3, 4, 5, 6, 0];

type Kinds = Map<string, DayKind>;
type Open = (x: CalendarItem) => void;

function useTime() {
  const { i18n } = useTranslation();
  return (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
}

/** One item as a row — the Month view's day list and the List view both draw this. */
export const ItemRow = memo(function ItemRow({ x, onOpen }: { x: CalendarItem; onOpen: Open }) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const time = useTime();
  const col = kindColor(x.kind, c, isDark);
  const where = x.kind === 'shift' ? x.note
    : x.meetingMode === 'PHONE' ? x.phone
    : x.meetingMode === 'ONLINE' ? t('calendar.mode.ONLINE', 'Online')
    : [x.room, x.location].filter(Boolean).join(' · ');
  const ask = x.kind === 'leave' && x.status === 'PENDING' ? t('calendar.requested', 'requested')
    : (x.kind === 'event' && x.status === 'PENDING') ? t('calendar.notAnswered', 'not answered') : null;
  return (
    <Pressable
      onPress={() => onOpen(x)}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), borderRadius: 16, paddingVertical: amazen.space(2.5), paddingHorizontal: amazen.space(3), backgroundColor: c.well, opacity: pressed ? 0.85 : 1 })}
    >
      <AText variant="caption" numeric numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ width: 50, fontSize: 11, color: c.inkMuted, fontFamily: amazen.font.mono }}>
        {x.allDay ? t('calendar.allDayShort', 'all day') : time(x.start)}
      </AText>
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: col, opacity: x.status === 'PENDING' && x.kind === 'leave' ? 0.5 : 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14, textDecorationLine: x.status === 'DECLINED' ? 'line-through' : 'none' }}>{x.title}</AText>
        {where || x.kind === 'leave' ? (
          <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
            {x.kind === 'leave' ? t(`calendar.leaveType.${x.note ?? 'VACATION'}`, x.note ?? '') : where}
          </AText>
        ) : null}
      </View>
      {ask ? <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: c.warnTint }}><AText variant="caption" tone="warn" style={{ fontSize: 11 }}>{ask}</AText></View> : null}
    </Pressable>
  );
});

/** The chosen day under the month grid — or the hint when it is empty. */
export function DayList({ items, day, onOpen }: { items: CalendarItem[]; day: string; onOpen: Open }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const list = useMemo(() => itemsOn(items, day), [items, day]);
  if (!list.length) {
    return (
      <Well style={{ padding: amazen.space(4), alignItems: 'center', gap: amazen.space(1) }}>
        <AText variant="body" tone="strong">{t('calendar.nothingDay', 'Nothing planned')}</AText>
        <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>{t('calendar.addHint', 'Tap + and type it — “call Müller at 2 for 30 min”.')}</AText>
      </Well>
    );
  }
  return <View style={{ gap: amazen.space(1.5) }}>{list.map((x) => <ItemRow key={x.id} x={x} onOpen={onOpen} />)}</View>;
}

/** Month: a six-week grid, one dot per kind on a day (shifts left out — they are every day). */
export function MonthGrid({ anchor, selected, items, kinds, onPick }: { anchor: Date; selected: string; items: CalendarItem[]; kinds: Kinds; onPick: (d: Date) => void }) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const { i18n } = useTranslation();
  const today = dayKey(new Date());
  const start = monthGridStart(anchor);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(start, i)), [start.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const dots = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const d of days) {
      const k = dayKey(d);
      m.set(k, [...new Set(itemsOn(items, k).filter((x) => x.kind !== 'shift').map((x) => kindColor(x.kind, c, isDark)))].slice(0, 4));
    }
    return m;
  }, [days, items, c, isDark]);
  const names = WEEKDAY_KEYS.map((wd) => new Date(2026, 1, 1 + wd).toLocaleDateString(i18n.language, { weekday: 'narrow' }));
  return (
    <View>
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        {names.map((n, i) => <AText key={i} variant="caption" tone="muted" style={{ flex: 1, textAlign: 'center', fontSize: 11, fontFamily: amazen.font.mono }}>{n}</AText>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === anchor.getMonth();
          const kind = kinds.get(k);
          const holiday = kind === 'holiday' || kind === 'half-holiday';
          const rest = kind === 'weekend' || kind === 'off-rota';
          const on = k === selected;
          const isToday = k === today;
          return (
            <Pressable
              key={k}
              onPress={() => onPick(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={d.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
              style={{ width: `${100 / 7}%`, height: 50, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 14,
                backgroundColor: on ? c.accentTint : holiday && inMonth ? c.criticalTint : 'transparent',
                borderWidth: isToday ? 1 : 0, borderColor: c.accent }}
            >
              <AText variant="body" numeric style={{ fontSize: 15, color: on || isToday ? c.accent : !inMonth ? c.inkMuted + '80' : holiday ? c.critical : rest ? c.inkMuted : c.inkStrong, fontWeight: on ? '600' : '400' }}>{d.getDate()}</AText>
              <View style={{ flexDirection: 'row', gap: 3, height: 5 }}>
                {(inMonth ? dots.get(k) ?? [] : []).map((col, i) => <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: col }} />)}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Day and 3 days: an hour grid, all-day items on top, overlapping items side by side, a line at
 * now. It opens scrolled to the first item or 07:00.
 */
export function TimeGrid({ days, items, kinds, onOpen, onPressHour }: { days: Date[]; items: CalendarItem[]; kinds: Kinds; onOpen: Open; onPressHour?: (at: Date) => void }) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const scroll = useRef<ScrollView>(null);
  const keys = days.map(dayKey);
  const laid = useMemo(() => keys.map((k) => layoutDay(itemsOn(items, k), k)), [items, keys.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const allDay = useMemo(() => keys.map((k) => itemsOn(items, k).filter((x) => x.allDay)), [items, keys.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = Math.min(7 * 60, ...laid.flat().map((r) => r.startMin));
  useEffect(() => {
    const id = setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, (first / 60 - 0.5) * HOUR), animated: false }), 0);
    return () => clearTimeout(id);
  }, [keys.join(), first]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = new Date();
  const nowKey = dayKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hourLabel = (h: number) => new Date(2026, 0, 1, h).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const multi = days.length > 1;
  return (
    <View style={{ flex: 1 }}>
      {multi ? (
        <View style={{ flexDirection: 'row', paddingLeft: 52, paddingBottom: 6 }}>
          {days.map((d) => {
            const k = dayKey(d);
            const isToday = k === nowKey;
            return (
              <View key={k} style={{ flex: 1, alignItems: 'center' }}>
                <AText variant="caption" tone="muted" style={{ fontSize: 10.5, fontFamily: amazen.font.mono }}>{d.toLocaleDateString(i18n.language, { weekday: 'short' }).toUpperCase()}</AText>
                <AText variant="body" numeric style={{ fontSize: 15, color: isToday ? c.accent : kinds.get(k) === 'holiday' ? c.critical : c.inkStrong }}>{d.getDate()}</AText>
              </View>
            );
          })}
        </View>
      ) : null}
      {allDay.some((a) => a.length) ? (
        <View style={{ flexDirection: 'row', paddingLeft: 52, gap: 4, paddingBottom: 6 }}>
          {allDay.map((list, i) => (
            <View key={keys[i]} style={{ flex: 1, gap: 3 }}>
              {list.slice(0, 3).map((x) => (
                <Pressable key={x.id} onPress={() => onOpen(x)} accessibilityRole="button" style={{ borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: kindColor(x.kind, c, isDark) + '26' }}>
                  <AText variant="caption" numberOfLines={1} style={{ fontSize: 11, color: kindColor(x.kind, c, isDark) }}>{x.title}</AText>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ height: 24 * HOUR + 16 }}>
        {Array.from({ length: 24 }, (_, h) => (
          <Pressable
            key={h}
            onPress={onPressHour && !multi ? () => { const d = new Date(days[0]!); d.setHours(h, 0, 0, 0); onPressHour(d); } : undefined}
            style={{ position: 'absolute', left: 0, right: 0, top: h * HOUR, height: HOUR, flexDirection: 'row' }}
          >
            <AText variant="caption" numeric style={{ width: 46, textAlign: 'right', fontSize: 10, color: c.inkMuted, fontFamily: amazen.font.mono, marginTop: -6 }}>{h === 0 ? '' : hourLabel(h)}</AText>
            <View style={{ flex: 1, marginLeft: 6, borderTopWidth: 1, borderColor: c.lineWell }} />
          </Pressable>
        ))}
        <View style={{ position: 'absolute', left: 52, right: 4, top: 0, bottom: 0, flexDirection: 'row', gap: 4 }} pointerEvents="box-none">
          {laid.map((rows, i) => (
            <View key={keys[i]} style={{ flex: 1 }} pointerEvents="box-none">
              {rows.map((r) => {
                const col = kindColor(r.item.kind, c, isDark);
                const top = (r.startMin / 60) * HOUR;
                const height = Math.max(((r.endMin - r.startMin) / 60) * HOUR - 2, 26);
                return (
                  <Pressable
                    key={r.item.id}
                    onPress={() => onOpen(r.item)}
                    accessibilityRole="button"
                    accessibilityLabel={r.item.title}
                    style={{ position: 'absolute', top, height, left: `${(r.col / r.cols) * 100}%`, width: `${100 / r.cols}%`, paddingRight: 2 }}
                  >
                    <View style={{ flex: 1, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: col, backgroundColor: col + '2e', paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden' }}>
                      <AText variant="caption" tone="strong" numberOfLines={height > 40 ? 2 : 1} style={{ fontSize: multi ? 11 : 12.5 }}>{r.item.title}</AText>
                      {height > 44 && !multi ? (
                        <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>
                          {r.item.kind === 'shift' ? r.item.note : r.item.meetingMode === 'PHONE' ? r.item.phone : r.item.meetingMode === 'ONLINE' ? t('calendar.mode.ONLINE', 'Online') : r.item.location}
                        </AText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {keys[i] === nowKey ? (
                <View pointerEvents="none" style={{ position: 'absolute', left: -4, right: 0, top: (nowMin / 60) * HOUR, height: 2, backgroundColor: c.accent }}>
                  <View style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** List: what is coming, grouped by day — days with nothing are left out. */
export function ListView({ from, days, items, kinds, onOpen, footer }: { from: Date; days: number; items: CalendarItem[]; kinds: Kinds; onOpen: Open; footer?: React.ReactElement }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const today = dayKey(new Date());
  const groups = useMemo(() => {
    const out: { key: string; date: Date; list: CalendarItem[] }[] = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(from, i);
      const k = dayKey(d);
      const list = itemsOn(items, k).filter((x) => x.kind !== 'shift' || k === today);
      if (list.length) out.push({ key: k, date: d, list });
    }
    return out;
  }, [from.getTime(), days, items, today]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FlatList
      data={groups}
      keyExtractor={(g) => g.key}
      initialNumToRender={6}
      windowSize={7}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={<Well style={{ padding: amazen.space(5), alignItems: 'center' }}><AText variant="body" tone="strong">{t('calendar.nothingAhead', 'Nothing coming up')}</AText></Well>}
      ListFooterComponent={footer}
      contentContainerStyle={{ gap: amazen.space(3), paddingBottom: 140 }}
      renderItem={({ item: g }) => {
        const kind = kinds.get(g.key);
        return (
          <View style={{ gap: amazen.space(1.5) }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 4 }}>
              <AText variant="body" tone="strong" style={{ fontSize: 15 }}>
                {g.key === today ? t('calendar.today', 'Today') : g.date.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'short' })}
              </AText>
              {kind === 'holiday' || kind === 'half-holiday' ? <AText variant="caption" style={{ fontSize: 10.5, color: c.critical, fontFamily: amazen.font.mono }}>{t('calendar.holiday', 'Holiday').toUpperCase()}</AText> : null}
            </View>
            {g.list.map((x) => <ItemRow key={x.id} x={x} onOpen={onOpen} />)}
          </View>
        );
      }}
    />
  );
}
