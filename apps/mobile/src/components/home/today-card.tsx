import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { CalendarItem } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText, CardSurface, Eyebrow } from '../amazen';
import { calendarApi } from '../../lib/api';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { addDays, dayKey, fromKey, kindColor } from '../calendar/calendar-data';
import { WellDoor } from './well-door';

const AHEAD_DAYS = 14;

/**
 * ⭐ TODAY — the calendar's answer on the home screen: what is on today (appointments, reminders,
 * client follow-ups), and what is coming (a holiday, my leave). Jobs live on My work, so they are
 * not repeated here. One read, the same endpoint the calendar draws.
 */
export function TodayCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const today = new Date();
  const from = dayKey(today), to = dayKey(addDays(today, AHEAD_DAYS));
  const load = useCallback(async () => {
    try {
      const r = await calendarApi.range({
        from,
        to,
        layers: ['events', 'crm', 'holidays', 'leave'],
        lang: (i18n.language || 'en').slice(0, 2),
      });
      setItems(r.items);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [from, to, i18n.language]);
  useLiveRefresh(load, 120_000);

  const now = Date.now();
  const { todayList, coming } = useMemo(() => {
    const list = items ?? [];
    const todays = list
      .filter((x) => !x.allDay && dayKey(new Date(x.start)) === from && new Date(x.end).getTime() > now && x.status !== 'DECLINED')
      .sort((a, b) => (a.start < b.start ? -1 : 1));
    // Coming: a holiday, my own leave (no workspace is chosen, so only mine comes back), and
    // invitations still waiting for my answer.
    const ahead = list
      .filter((x) => (x.kind === 'holiday' || x.kind === 'leave')
        ? x.end >= from
        : x.kind === 'event' && dayKey(new Date(x.start)) > from && x.status === 'PENDING')
      .sort((a, b) => (a.start < b.start ? -1 : 1))
      .slice(0, 3);
    return { todayList: todays.slice(0, 3), coming: ahead };
  }, [items, from, now]);

  if (items === null && !failed) return <View style={style}><CardSurface style={{ height: 150 }} /></View>;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const openCal = () => router.push('/(app)/(tabs)/calendar' as Href);
  const first = todayList[0];

  return (
    <View style={style}>
      <CardSurface style={{ padding: amazen.space(4.5), paddingBottom: amazen.space(2), gap: amazen.space(2.5) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Eyebrow tone="muted" style={{ flex: 1 }}>{t('widgets.today', 'Today')}</Eyebrow>
          {todayList.length ? <AText variant="caption" tone="accent">{t('todayCard.count', { count: todayList.length })}</AText> : null}
        </View>

        {first ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/(tabs)/calendar',
                params: first.ref?.type === 'event' ? { event: first.ref.id } : {},
              } as never)
            }
            accessibilityRole="button">
            <AText variant="h3" tone="strong" numberOfLines={2} style={{ fontSize: 21, lineHeight: 26 }}>{first.title}</AText>
            <AText variant="caption" tone="ink" numberOfLines={1} style={{ marginTop: 2 }}>
              {[
                `${time(first.start)}–${time(first.end)}`,
                first.location,
                first.meetingUrl ? t('calendar.online', 'Online') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </AText>
          </Pressable>
        ) : (
          <AText variant="body" tone="strong">
            {failed
              ? t('todayCard.offline', 'Needs a connection to see your day.')
              : t('todayCard.clear', 'Nothing else planned today.')}
          </AText>
        )}

        {todayList.slice(1).map((x) => (
          <Row key={x.id} color={kindColor(x.kind, c, isDark)} lead={time(x.start)} title={x.title} onPress={openCal} />
        ))}

        {coming.length ? (
          <View style={{ gap: amazen.space(1.5), paddingTop: amazen.space(1) }}>
            <Eyebrow tone="muted">{t('todayCard.coming', 'Coming up')}</Eyebrow>
            {coming.map((x) => (
              <Row
                key={x.id}
                color={kindColor(x.kind, c, isDark)}
                lead={fromKey(
                  x.allDay ? (x.start < from ? from : x.start) : dayKey(new Date(x.start)),
                ).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric' })}
                title={
                  x.kind === 'leave'
                    ? t('todayCard.leave', { defaultValue: 'Time off · {{name}}', name: x.personName ?? '' })
                    : x.title
                }
                tag={x.kind === 'holiday' ? t('calendar.holiday', 'Holiday') : x.status === 'PENDING' ? (x.kind === 'leave' ? t('calendar.requested', 'requested') : t('todayCard.invited', 'Invited')) : undefined}
                onPress={openCal}
              />
            ))}
          </View>
        ) : null}

        <WellDoor onPress={openCal} title={t('todayCard.open', 'Open the calendar')} />
      </CardSurface>
    </View>
  );
}

function Row({ color, lead, title, tag, onPress }: { color: string; lead: string; title: string; tag?: string; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: amazen.space(3),
        paddingVertical: amazen.space(2),
        paddingHorizontal: amazen.space(3),
        borderRadius: 16,
        backgroundColor: c.tile,
        opacity: pressed ? 0.8 : 1,
      })}>
      <AText variant="caption" numeric style={{ width: 52, fontFamily: amazen.font.mono, fontSize: 11.5, color: c.accent }}>{lead}</AText>
      <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1, fontSize: 13.5 }}>{title}</AText>
      {tag ? (
        <AText variant="caption" style={{ fontSize: 11, color }}>
          {tag}
        </AText>
      ) : (
        <View style={{ width: 5, height: 20, borderRadius: 3, backgroundColor: color }} />
      )}
    </Pressable>
  );
}
