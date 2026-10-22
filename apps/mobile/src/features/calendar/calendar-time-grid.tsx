/** TimeGrid from calendar-views.tsx — moved here unchanged (2026-10-17 line-length split). */
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CalendarItem } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../../components/amazen';
import { dayKey, itemsOn, kindColor, layoutDay } from './calendar-data';
import { type Kinds, type Open } from './calendar-view-types';

export const HOUR = 52;

/**
 * Day and 3 days: an hour grid, all-day items on top, overlapping items side by side, a line at
 * now. It opens scrolled to the first item or 07:00.
 */
export function TimeGrid({
  days,
  items,
  kinds,
  onOpen,
  onPressHour,
}: {
  days: Date[];
  items: CalendarItem[];
  kinds: Kinds;
  onOpen: Open;
  onPressHour?: (at: Date) => void;
}) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const scroll = useRef<ScrollView>(null);
  const keys = days.map(dayKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const laid = useMemo(() => keys.map((k) => layoutDay(itemsOn(items, k), k)), [items, keys.join()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allDay = useMemo(() => keys.map((k) => itemsOn(items, k).filter((x) => x.allDay)), [items, keys.join()]);
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
                <AText variant="caption" tone="muted" style={{ fontSize: 10.5, fontFamily: amazen.font.mono }}>
                  {d.toLocaleDateString(i18n.language, { weekday: 'short' }).toUpperCase()}
                </AText>
                <AText
                  variant="body"
                  numeric
                  style={{
                    fontSize: 15,
                    color: isToday ? c.accent : kinds.get(k) === 'holiday' ? c.critical : c.inkStrong,
                  }}
                >
                  {d.getDate()}
                </AText>
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
                <Pressable
                  key={x.id}
                  onPress={() => onOpen(x)}
                  accessibilityRole="button"
                  style={{
                    borderRadius: 8,
                    paddingHorizontal: 6,
                    paddingVertical: 4,
                    backgroundColor: kindColor(x.kind, c, isDark) + '26',
                  }}>
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
            <AText
              variant="caption"
              numeric
              style={{
                width: 46,
                textAlign: 'right',
                fontSize: 10,
                color: c.inkMuted,
                fontFamily: amazen.font.mono,
                marginTop: -6,
              }}
            >
              {h === 0 ? '' : hourLabel(h)}
            </AText>
            <View style={{ flex: 1, marginLeft: 6, borderTopWidth: 1, borderColor: c.lineWell }} />
          </Pressable>
        ))}
        <View
          style={{ position: 'absolute', left: 52, right: 4, top: 0, bottom: 0, flexDirection: 'row', gap: 4 }}
          pointerEvents="box-none">
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
                    style={{
                      position: 'absolute',
                      top,
                      height,
                      left: `${(r.col / r.cols) * 100}%`,
                      width: `${100 / r.cols}%`,
                      paddingRight: 2,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        borderLeftWidth: 3,
                        borderLeftColor: col,
                        backgroundColor: col + '2e',
                        paddingHorizontal: 6,
                        paddingVertical: 3,
                        overflow: 'hidden',
                      }}>
                      <AText
                        variant="caption"
                        tone="strong"
                        numberOfLines={height > 40 ? 2 : 1}
                        style={{ fontSize: multi ? 11 : 12.5 }}
                      >
                        {r.item.title}
                      </AText>
                      {height > 44 && !multi ? (
                        <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>
                          {r.item.kind === 'shift'
                            ? r.item.note
                            : r.item.meetingMode === 'PHONE'
                              ? r.item.phone
                              : r.item.meetingMode === 'ONLINE'
                                ? t('calendar.mode.ONLINE', 'Online')
                                : r.item.location}
                        </AText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {keys[i] === nowKey ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: -4,
                    right: 0,
                    top: (nowMin / 60) * HOUR,
                    height: 2,
                    backgroundColor: c.accent,
                  }}>
                  <View
                    style={{
                      position: 'absolute',
                      left: -4,
                      top: -4,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: c.accent,
                    }}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
