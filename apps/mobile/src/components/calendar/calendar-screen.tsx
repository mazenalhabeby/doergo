import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CALENDAR_LAYERS, type CalendarItem, type CalendarLayer } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { AText, FilterPill, Ground, ScreenHeader, Well, useTabSafe } from '../amazen';
import { PlusGlyph } from '../job/job-glyphs';
import { holds } from '../../lib/permissions';
import { addDays, dayKey, stepAnchor, useCalendarRange, type CalendarView } from './calendar-data';
import { DayList, ListView, MonthGrid, TimeGrid } from './calendar-views';
import { FiltersSheet, LeaveSheet } from './calendar-sheets';
import { EventSheet } from './event-sheet';

const VIEW_KEY = 'calendar.view.v1';
const VIEWS: CalendarView[] = ['day', 'three', 'month', 'list'];

/**
 * CALENDAR — the web's calendar on the phone: Day · 3 days · Month · List, a workspace and what to
 * show, the same colour per kind, and one + for everything new.
 *
 * One read per visible range (the web's endpoint), the neighbours read in the background so the
 * arrows are instant, pages kept for offline viewing. Adding and answering need a connection.
 */
export function CalendarScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const tabSafe = useTabSafe();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ event?: string }>();

  const [view, setView] = useState<CalendarView>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [layers, setLayers] = useState<CalendarLayer[]>([...CALENDAR_LAYERS]);
  const [filters, setFilters] = useState(false);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [leave, setLeave] = useState<CalendarItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // The last view is remembered on this phone (a convenience; Month when nothing is stored).
  useEffect(() => {
    AsyncStorage.getItem(VIEW_KEY)
      .then((v) => {
        if (v && (VIEWS as string[]).includes(v)) setView(v as CalendarView);
      })
      .catch(() => undefined);
  }, []);
  // Switching view keeps the day in hand: Month opens on its month, the others start on it.
  const choose = (v: CalendarView) => { setView(v); setAnchor(selected); AsyncStorage.setItem(VIEW_KEY, v).catch(() => undefined); };

  // A push names an event: open it once the screen is here.
  useEffect(() => {
    if (params.event) {
      setOpenEvent(String(params.event));
      router.setParams({ event: undefined } as never);
    }
  }, [params.event, router]);

  const allLayers = layers.length === CALENDAR_LAYERS.length;
  const { data, kinds, failed, reload, from } = useCalendarRange(view, anchor, spaceId, allLayers ? null : layers);
  const items = useMemo(() => (layers.length ? data?.items ?? [] : []), [data, layers.length]);
  const counts = useMemo(() => {
    const m: Partial<Record<CalendarLayer, number>> = {};
    for (const x of items) m[x.layer] = (m[x.layer] ?? 0) + 1;
    return m;
  }, [items]);
  const places = useMemo(() => (data?.places ?? []).filter((p) => p.spaceId).map((p) => ({ spaceId: p.spaceId!, name: p.name })), [data]);
  const placeName = spaceId ? places.find((p) => p.spaceId === spaceId)?.name ?? t('calendar.workspace', 'Workspace') : t('calendar.myCalendar', 'My calendar');
  const canDecideLeave = holds(user as never, 'canManageRota');
  const showSchedule = holds(user as never, 'canViewAllTasks');
  const loc = i18n.language;
  const todayKey = dayKey(new Date());

  const heading = view === 'month' || view === 'list'
    ? anchor.toLocaleDateString(loc, { month: 'long', year: 'numeric' })
    : view === 'day'
      ? anchor.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })
      : (`${anchor.toLocaleDateString(loc, { day: 'numeric', month: 'short' })} – ` + `${addDays(anchor, 2).toLocaleDateString(loc, { day: 'numeric', month: 'short' })}`);

  const open = (x: CalendarItem) => {
    if (x.ref?.type === 'event') setOpenEvent(x.ref.id);
    else if (x.kind === 'leave') setLeave(x);
    else if (x.ref?.type === 'task') router.push({ pathname: '/(app)/task/[id]', params: { id: x.ref.id } } as never);
    else if (x.ref?.type === 'customer') router.push({ pathname: '/(app)/customer/[id]', params: { id: x.ref.id } } as never);
    else if (x.kind === 'document') router.push('/(app)/documents' as Href);
  };
  const newAt = (at?: Date) => router.push({
    pathname: '/(app)/calendar-new',
    params: {
      day: dayKey(at ?? (view === 'month' ? selected : anchor)),
      ...(at ? { hour: String(at.getHours()) } : {}),
      ...(spaceId ? { spaceId } : {}),
    },
  } as never);
  const goToday = () => { const n = new Date(); setAnchor(n); setSelected(n); };
  const step = (dir: -1 | 1) => {
    const next = stepAnchor(view, anchor, dir);
    setAnchor(next);
    if (view !== 'month') setSelected(next);
  };
  const offToday = dayKey(anchor) !== todayKey || (view === 'month' && dayKey(selected) !== todayKey);

  const iconBtn = {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.glass,
    borderWidth: 1,
    borderColor: c.lineGlass,
  };

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader
        title={t('calendar.title', 'Calendar')}
        subtitle={heading}
        actions={[
          ...(offToday ? [{ label: t('calendar.today', 'Today'), onPress: goToday }] : []),
          { label: t('calendar.show', 'Show'), onPress: () => setFilters(true) },
        ]}
      />

      <View style={{ paddingHorizontal: amazen.space(4), gap: amazen.space(2.5), paddingBottom: amazen.space(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <FilterPill label={`${placeName} ▾`} on={!!spaceId} onPress={() => setFilters(true)} />
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => step(-1)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('calendar.previous', 'Previous')}
            style={iconBtn}
          >
            <AText variant="body" tone="strong">
              ‹
            </AText>
          </Pressable>
          <Pressable
            onPress={() => step(1)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('calendar.next', 'Next')}
            style={iconBtn}
          >
            <AText variant="body" tone="strong">
              ›
            </AText>
          </Pressable>
        </View>
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: 'row',
            padding: 3,
            borderRadius: 14,
            backgroundColor: c.glass,
            borderWidth: 1,
            borderColor: c.lineGlass,
          }}>
          {VIEWS.map((v) => (
            <Pressable key={v} onPress={() => choose(v)} accessibilityRole="tab" accessibilityState={{ selected: view === v }}
              style={{
                flex: 1,
                height: 32,
                borderRadius: 11,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: view === v ? c.well : 'transparent',
              }}>
              <AText variant="caption" style={{ fontSize: 13, color: view === v ? c.inkStrong : c.inkMuted }}>
                {t(`calendar.view.${v}`)}
              </AText>
            </Pressable>
          ))}
        </View>
      </View>

      {failed && !data ? (
        <Well style={{ marginHorizontal: amazen.space(4), padding: amazen.space(5), alignItems: 'center' }}>
          <AText variant="body" tone="ink" style={{ textAlign: 'center' }}>
            {t('calendar.offline', 'Needs a connection to load your calendar.')}
          </AText>
        </Well>
      ) : null}

      <View style={{ flex: 1, paddingHorizontal: view === 'day' || view === 'three' ? amazen.space(2) : amazen.space(4) }}>
        {view === 'month' ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: amazen.space(3), paddingBottom: tabSafe + 90 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  await reload();
                  setRefreshing(false);
                }}
                tintColor={c.accent}
                colors={[c.accent]}
              />
            }
          >
            <MonthGrid
              anchor={anchor}
              selected={dayKey(selected)}
              items={items}
              kinds={kinds}
              onPick={(d) => {
                setSelected(d);
                if (d.getMonth() !== anchor.getMonth()) setAnchor(d);
              }}
            />
            <AText variant="body" tone="strong" style={{ paddingHorizontal: 4, fontSize: 15 }}>
              {dayKey(selected) === todayKey
                ? t('calendar.today', 'Today')
                : selected.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}
            </AText>
            <DayList items={items} day={dayKey(selected)} onOpen={open} />
          </ScrollView>
        ) : view === 'list' ? (
          <ListView from={from} days={31} items={items} kinds={kinds} onOpen={open} />
        ) : (
          <View style={{ flex: 1, paddingBottom: tabSafe }}>
            <TimeGrid
              days={view === 'day' ? [anchor] : [anchor, addDays(anchor, 1), addDays(anchor, 2)]}
              items={items}
              kinds={kinds}
              onOpen={open}
              onPressHour={view === 'day' ? newAt : undefined}
            />
          </View>
        )}
      </View>

      <Pressable
        onPress={() => newAt()}
        accessibilityRole="button"
        accessibilityLabel={t('calendar.new', 'New')}
        style={({ pressed }) => ({
          position: 'absolute',
          right: amazen.space(5),
          bottom: tabSafe + amazen.space(2),
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <LinearGradient
          colors={amazen.gradient.primary as unknown as [string, string]}
          style={{ width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
          <PlusGlyph size={26} color={c.accentInk} />
        </LinearGradient>
      </Pressable>

      <FiltersSheet
        visible={filters}
        onClose={() => setFilters(false)}
        places={places}
        spaceId={spaceId}
        onSpace={(id) => { setSpaceId(id); setFilters(false); }}
        layers={layers}
        onLayers={setLayers}
        counts={counts}
        showSchedule={showSchedule}
      />
      <EventSheet eventId={openEvent} onClose={() => setOpenEvent(null)} onChanged={reload} />
      <LeaveSheet
        item={leave}
        mine={leave?.personId === (user as { id?: string } | null)?.id}
        canDecide={canDecideLeave}
        onClose={() => setLeave(null)}
        onChanged={reload}
      />
    </Ground>
  );
}
