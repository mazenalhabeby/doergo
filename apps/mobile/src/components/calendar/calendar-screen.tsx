import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { CalendarItem } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText, Ground, ScreenHeader, Well, useTabSafe } from '../amazen';
import { SectionLabel } from '../job/job-ui';
import { PlusGlyph } from '../job/job-glyphs';
import { useResponsive } from '../../lib/responsive';
import { centeredContent } from '../screen-container';
import { addDays, dayKey, fromKey, itemsOn, kindColor, mondayOf, useCalendarWeek } from './calendar-data';
import { EventSheet } from './event-sheet';
import { QuickAddSheet } from './quick-add-sheet';

/**
 * CALENDAR — the member's own days: a week strip with a dot per kind, the day as a timeline, a
 * banner for the next holiday, and + to add something in a sentence.
 *
 * One read per week (the same endpoint the web draws), kept by the client for offline viewing.
 * Adding and answering need a connection — a queued answer to an invitation would arrive after
 * the meeting it was about.
 */
export function CalendarScreen() {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const tabSafe = useTabSafe();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;
  const params = useLocalSearchParams<{ event?: string }>();

  const [selected, setSelected] = useState(() => new Date());
  const monday = useMemo(() => mondayOf(selected), [selected]);
  const { data, kinds, failed, reload } = useCalendarWeek(monday);
  const [refreshing, setRefreshing] = useState(false);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // A push names an event: open it once the screen is here.
  useEffect(() => {
    if (params.event) {
      setOpenEvent(String(params.event));
      router.setParams({ event: undefined } as never);
    }
  }, [params.event, router]);

  const items = data?.items ?? [];
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const key = dayKey(selected);
  const today = dayKey(new Date());
  const day = itemsOn(items, key);
  const allDay = day.filter((x) => x.allDay);
  const timed = day.filter((x) => !x.allDay);
  const nextHoliday = items.find((x) => x.kind === 'holiday' && x.end >= today);
  const loc = i18n.language;

  const open = (x: CalendarItem) => {
    if (x.ref?.type === 'event') setOpenEvent(x.ref.id);
    else if (x.ref?.type === 'task') router.push({ pathname: '/(app)/task/[id]', params: { id: x.ref.id } } as never);
    else if (x.ref?.type === 'customer') router.push({ pathname: '/(app)/customer/[id]', params: { id: x.ref.id } } as never);
    else if (x.kind === 'leave') router.push('/(app)/(tabs)/time-off' as Href);
    else if (x.kind === 'document') router.push('/(app)/documents' as Href);
  };
  const time = (iso: string) => new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('calendar.title', 'Calendar')}
        subtitle={selected.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={key !== today ? [{ label: t('calendar.today', 'Today'), onPress: () => setSelected(new Date()) }] : undefined}
        style={wide ?? undefined}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: tabSafe + 72, gap: amazen.space(3) }, wide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} tintColor={c.accent} colors={[c.accent]} />}
      >
        {/* Week strip */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1) }}>
          <Pressable onPress={() => setSelected(addDays(selected, -7))} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('calendar.previous', 'Previous')} style={{ paddingHorizontal: 2 }}>
            <AText variant="body" tone="onGlass">‹</AText>
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', gap: 4, padding: 6, borderRadius: 22, backgroundColor: c.glass, borderWidth: 1, borderColor: c.lineGlass }}>
            {week.map((d) => {
              const k = dayKey(d);
              const on = k === key;
              const kind = kinds.get(k);
              const rest = kind === 'weekend' || kind === 'off-rota';
              const holiday = kind === 'holiday' || kind === 'half-holiday';
              const dots = [...new Set(itemsOn(items, k).filter((x) => x.kind !== 'shift').map((x) => x.kind))].slice(0, 3);
              const body = (
                <>
                  <AText variant="caption" style={{ fontSize: 10, letterSpacing: 0.4, color: on ? c.accentInk : c.inkMuted }}>
                    {d.toLocaleDateString(loc, { weekday: 'short' }).toUpperCase().slice(0, 3)}
                  </AText>
                  <AText variant="body" numeric style={{ fontSize: 16, color: on ? c.accentInk : holiday ? c.critical : rest ? c.inkMuted : c.inkStrong }}>{d.getDate()}</AText>
                  <View style={{ flexDirection: 'row', gap: 2, height: 4 }}>
                    {dots.map((kd) => <View key={kd} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: on ? c.accentInk : kindColor(kd, c, isDark) }} />)}
                  </View>
                </>
              );
              return (
                <Pressable key={k} onPress={() => setSelected(d)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })} style={{ flex: 1 }}>
                  {on ? (
                    <LinearGradient colors={amazen.gradient.primary as unknown as [string, string]} style={{ alignItems: 'center', gap: 3, paddingVertical: 8, borderRadius: 16 }}>
                      {body}
                    </LinearGradient>
                  ) : (
                    <View style={{ alignItems: 'center', gap: 3, paddingVertical: 8, borderRadius: 16 }}>{body}</View>
                  )}
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={() => setSelected(addDays(selected, 7))} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('calendar.next', 'Next')} style={{ paddingHorizontal: 2 }}>
            <AText variant="body" tone="onGlass">›</AText>
          </Pressable>
        </View>

        {nextHoliday ? (
          <Pressable onPress={() => setSelected(fromKey(nextHoliday.start))} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2.5), borderRadius: 18, paddingVertical: amazen.space(2.5), paddingHorizontal: amazen.space(3), backgroundColor: c.criticalTint, borderWidth: 1, borderColor: c.critical + '40' }}>
            <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: c.critical }} />
            <AText variant="caption" tone="strong" numberOfLines={1} style={{ flex: 1, fontSize: 13 }}>
              {nextHoliday.start === today
                ? t('calendar.holidayToday', { defaultValue: 'Today is {{name}}', name: nextHoliday.title })
                : t('calendar.holidayOn', { defaultValue: '{{day}} is {{name}}', day: fromKey(nextHoliday.start).toLocaleDateString(loc, { weekday: 'long' }), name: nextHoliday.title })}
            </AText>
            <AText variant="caption" tone="critical" style={{ fontSize: 11 }}>{nextHoliday.status === 'ESTIMATED' ? t('calendar.estimated', 'estimated') : t('calendar.holiday', 'Holiday')}</AText>
          </Pressable>
        ) : null}

        {failed && !data ? (
          <Well style={{ padding: amazen.space(5), alignItems: 'center' }}>
            <AText variant="body" tone="ink" style={{ textAlign: 'center' }}>{t('calendar.offline', 'Needs a connection to load your calendar.')}</AText>
          </Well>
        ) : null}

        {allDay.length > 0 ? (
          <View style={{ gap: amazen.space(1.5) }}>
            {allDay.map((x) => (
              <Pressable key={x.id} onPress={() => open(x)} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2.5), borderRadius: 16, paddingVertical: amazen.space(2.5), paddingHorizontal: amazen.space(3), backgroundColor: c.well, opacity: pressed ? 0.85 : 1 })}>
                <View style={{ width: 4, height: 22, borderRadius: 2, backgroundColor: kindColor(x.kind, c, isDark), opacity: x.status === 'PENDING' ? 0.5 : 1 }} />
                <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{x.title}</AText>
                <AText variant="caption" tone="muted" style={{ fontSize: 11.5 }}>
                  {x.kind === 'leave' ? t(`calendar.leaveType.${x.note ?? 'VACATION'}`, x.note ?? '') + (x.status === 'PENDING' ? ` · ${t('calendar.requested', 'requested')}` : '') : t(`calendar.kind.${x.kind}`)}
                </AText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <SectionLabel tone="accent" style={{ paddingHorizontal: amazen.space(1) }}>
          {key === today ? t('calendar.today', 'Today') : selected.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'short' })}
        </SectionLabel>

        {timed.length === 0 ? (
          <Well style={{ padding: amazen.space(5), alignItems: 'center', gap: amazen.space(1) }}>
            <AText variant="body" tone="strong">{t('calendar.nothingDay', 'Nothing planned')}</AText>
            <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>{t('calendar.addHint', 'Tap + and type it — “call Müller at 2 for 30 min”.')}</AText>
          </Well>
        ) : (
          <View style={{ position: 'relative', paddingLeft: 48, gap: amazen.space(2.25) }}>
            <View style={{ position: 'absolute', left: 54, top: 10, bottom: 10, width: 1, backgroundColor: c.lineWell }} />
            {timed.map((x) => {
              const col = kindColor(x.kind, c, isDark);
              const now = Date.now();
              const live = new Date(x.start).getTime() <= now && new Date(x.end).getTime() > now;
              return (
                <View key={x.id}>
                  <AText variant="caption" numeric style={{ position: 'absolute', left: -48, top: 12, width: 40, textAlign: 'right', fontSize: 10.5, color: c.inkMuted, fontFamily: amazen.font.mono }}>{time(x.start)}</AText>
                  <View style={{ position: 'absolute', left: 3, top: 14, width: 8, height: 8, borderRadius: 4, backgroundColor: col, borderWidth: 2, borderColor: c.canvas }} />
                  <Pressable
                    onPress={() => open(x)}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      marginLeft: 18, borderRadius: 20, paddingVertical: amazen.space(2.75), paddingHorizontal: amazen.space(3.25),
                      backgroundColor: c.well, borderWidth: 1, borderColor: live ? col : col + '33', opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5, textDecorationLine: x.status === 'DECLINED' ? 'line-through' : 'none' }}>{x.title}</AText>
                    <AText variant="caption" tone="ink" numberOfLines={1} style={{ fontSize: 11.5, marginTop: 1 }}>
                      {[`${time(x.start)}–${time(x.end)}`, x.kind === 'shift' ? x.note : x.location, x.status === 'PENDING' && x.kind !== 'job' ? t('calendar.notAnswered', 'not answered') : null].filter(Boolean).join(' · ')}
                    </AText>
                    {live ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
                        <AText variant="caption" tone="accent" style={{ fontSize: 11 }}>{t('calendar.now', 'Now')}</AText>
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => setAdding(true)}
        accessibilityRole="button"
        accessibilityLabel={t('calendar.new', 'New')}
        style={({ pressed }) => ({ position: 'absolute', right: amazen.space(5), bottom: tabSafe + amazen.space(2), opacity: pressed ? 0.88 : 1 })}
      >
        <LinearGradient colors={amazen.gradient.primary as unknown as [string, string]} style={{ width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
          <PlusGlyph size={26} color={c.accentInk} />
        </LinearGradient>
      </Pressable>

      <EventSheet eventId={openEvent} onClose={() => setOpenEvent(null)} onChanged={reload} />
      <QuickAddSheet visible={adding} day={selected} onClose={() => setAdding(false)} onSaved={reload} />
    </Ground>
  );
}
