import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { orgHasAddOn, localDateKey, todayKey } from '@hbcfield/shared/client';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useLiveRefresh } from '@/hooks/use-live-refresh';
import { rotaApi, type RotaCell, type RotaWeek } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { AText, ChoicePill, Ground, HeaderBack, ScreenHeader, Well, Banner, SectionLabel } from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { JobSheet } from '../job/job-ui';
import { NAME_W, Cell, Legend, RoundArrow, DaySheet } from './day-sheet';
import { LoadingLine } from '@/components/loading-line';
import { pullRefresh } from '@/components/pull-refresh';

/**
 * SCHEDULES — who works when, in one workspace, for one week — as the CLOCK-IN
 * reads it.
 *
 * ⚠️ IT READ THE WRONG THING. The page showed only each person's personal
 * weekly schedule, which the clock-in uses only when the workspace rota says
 * nothing — and drew it a day late (0 = Sunday, the row is Monday first). It
 * now shows the rota's answer for each day (`GET /rota/week`, the shared
 * `rotaFor` rule), the weekly schedule only where the rota is silent, and
 * approved time off. One request for the week; it asked once per person.
 *
 * ⚠️ EDITING IS THE SERVER'S TO ALLOW. `canEdit` comes back per workspace
 * (canManageRota there), the Option (`shift_scheduling`) must be bought, and
 * the write checks both again.
 */
export function SchedulesScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const [spaceId, setSpaceId] = useState<string | undefined>(undefined);
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [week, setWeek] = useState<RotaWeek | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ userId: string; name: string; cell: RotaCell } | null>(null);

  /*
    ⚠️ SMOOTH BY CONSTRUCTION, NOT BY ANIMATION ALONE.
     • A week already seen comes back from memory at once and refreshes
       behind — flicking back and forth never waits.
     • A reply that arrives after a newer choice is dropped — a slow answer
       for BILLA must not land on top of Main Office.
     • While a new one loads, the grid stays where it is, dimmed, and fades in
       when the answer lands — no blank, no jump.
  */
  const seen = useRef(new Map<string, RotaWeek>());
  const asked = useRef(0);
  const [pending, setPending] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const keyOf = (sp?: string, f?: string) => `${sp ?? ''}|${f ?? ''}`;
  const load = useCallback(async () => {
    const ticket = ++asked.current;
    const key = keyOf(spaceId, from);
    const kept = seen.current.get(key);
    if (kept) setWeek(kept);
    else {
      setPending(true);
      Animated.timing(fade, { toValue: 0.4, duration: 120, useNativeDriver: true }).start();
    }
    try {
      const next = await rotaApi.week({ spaceId, from });
      if (ticket !== asked.current) return;
      seen.current.set(key, next);
      // The answer names the space and week it chose — remember it under those too.
      seen.current.set(keyOf(next.space?.id, next.days[0]), next);
      setWeek(next);
      setFailed(false);
    } catch {
      if (ticket === asked.current) setFailed(true);
    } finally {
      if (ticket === asked.current) {
        setPending(false);
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      }
    }
  }, [spaceId, from, fade]);
  useLiveRefresh(load, null);
  /*
    ⚠️ A NEW WORKSPACE OR WEEK IS A NEW QUESTION. `useLiveRefresh` asks on
    focus and resume only — it holds the latest `load` by ref precisely so an
    identity change is NOT a trigger — so tapping a chip or an arrow changed
    the selection and asked nothing until a pull. The first run is the focus's.
  */
  const firstChoice = useRef(true);
  useEffect(() => {
    if (firstChoice.current) { firstChoice.current = false; return; }
    void load();
  }, [spaceId, from, load]);

  const canEdit = !!week?.canEdit && orgHasAddOn(user?.orgAddOns ?? null, 'shift_scheduling');
  const shiftsById = useMemo(() => new Map((week?.shifts ?? []).map((s) => [s.id, s])), [week?.shifts]);
  const todayK = todayKey();
  const dayDate = (k: string) => new Date(`${k}T12:00:00`);
  const shiftWeek = (n: number) => {
    const first = shownDays[0];
    if (!first) return;
    const d = dayDate(first);
    d.setDate(d.getDate() + n * 7);
    setFrom(localDateKey(d));
  };
  const fmt = (k: string, o: Intl.DateTimeFormatOptions) => dayDate(k).toLocaleDateString(i18n.language, o);
  /* The week the member CHOSE, drawn the moment they tap — not when the server answers. */
  const shownDays = (() => {
    if (!from || week?.days[0] === from) return week?.days ?? [];
    const d = dayDate(from);
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      return localDateKey(x);
    });
  })();
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/more' as Href));

  return (
    <Ground style={{ flex: 1 }}>
      <ScreenHeader title={t('manage.schedules.label', 'Schedules')} leading={<HeaderBack onPress={back} />} style={wide ?? undefined} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(12), gap: amazen.space(3) }, wide]}
        refreshControl={
          pullRefresh({ refreshing, setRefreshing, load, color: c.accent })
        }
      >
        {failed && !week ? <Banner tone="critical" text={t('rota.failed', 'Could not load the schedule. Pull to try again.')} /> : null}

        {week && week.spaces.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: amazen.space(1.5) }}>
            {week.spaces.map((s) => {
              const on = s.id === (spaceId ?? week.space?.id);
              return (
                <ChoicePill key={s.id} label={s.name} on={on} onPress={() => setSpaceId(s.id)} truncate />
              );
            })}
          </ScrollView>
        ) : null}

        {shownDays.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
            <RoundArrow label="‹" a11y={t('rota.prevWeek', 'Previous week')} onPress={() => shiftWeek(-1)} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <AText
                variant="body"
                tone="strong"
                style={{ fontSize: 15 }}
              >{(`${fmt(shownDays[0]!, { day: 'numeric', month: 'short' })} – ` + `${fmt(shownDays[6]!, { day: 'numeric', month: 'short' })}`)}</AText>
              {shownDays.includes(todayK) ? <SectionLabel tone="accent">{t('rota.thisWeek', 'This week')}</SectionLabel> : null}
            </View>
            <RoundArrow label="›" a11y={t('rota.nextWeek', 'Next week')} onPress={() => shiftWeek(1)} />
          </View>
        ) : null}

        <Animated.View style={{ opacity: fade, gap: amazen.space(3) }} pointerEvents={pending ? 'none' : 'auto'}>
        {!week ? (
          failed ? null : <LoadingLine onGlass padUnits={6} />
        ) : !week.space ? (
          <Well style={{ padding: amazen.space(5) }}>
            <AText variant="body" tone="ink">
              {t('rota.noSpaces', 'No workspaces to show.')}
            </AText>
          </Well>
        ) : week.people.length === 0 ? (
          <Well style={{ padding: amazen.space(5), gap: amazen.space(1) }}>
            <AText variant="body" tone="strong">
              {t('rota.nobody', { defaultValue: 'Nobody is assigned to {{space}}', space: week.space.name })}
            </AText>
            {canEdit ? (
              <AText variant="caption" tone="muted">
                {t('rota.setUpOnWeb', 'Add shifts and people in the workspace’s Attendance settings on the web.')}
              </AText>
            ) : null}
          </Well>
        ) : (
          <>
            <Well style={{ paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(2) }}>
              {/* Header row — the days */}
              <View style={{ flexDirection: 'row', gap: 3, marginBottom: 4 }}>
                <View style={{ width: NAME_W }} />
                {week.days.map((k) => (
                  <View key={k} style={{ flex: 1, alignItems: 'center' }}>
                    <AText
                      numberOfLines={1}
                      style={{
                        fontFamily: amazen.font.mono,
                        fontSize: 9.5,
                        letterSpacing: 0.8,
                        color: k === todayK ? c.accent : c.inkMuted,
                        textTransform: 'uppercase',
                      }}>
                      {fmt(k, { weekday: 'short' })}
                    </AText>
                    <AText
                      numberOfLines={1}
                      style={{ fontFamily: amazen.font.mono, fontSize: 11, color: k === todayK ? c.accent : c.ink }}
                    >
                      {dayDate(k).getDate()}
                    </AText>
                  </View>
                ))}
              </View>
              {week.people.map((p) => (
                <View key={p.userId} style={{ flexDirection: 'row', gap: 3, marginTop: 3 }}>
                  <View style={{ width: NAME_W, justifyContent: 'center', paddingRight: 4 }}>
                    <AText variant="caption" tone="strong" numberOfLines={1} style={{ fontSize: 12.5 }}>{p.firstName}</AText>
                    {p.position ? (
                      <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 10 }}>
                        {p.position}
                      </AText>
                    ) : null}
                  </View>
                  {p.days.map((cell) => (
                    <Cell
                      key={cell.date}
                      cell={cell}
                      shift={cell.kind === 'shift' ? shiftsById.get(cell.shiftId) : undefined}
                      onPress={
                        canEdit && cell.kind !== 'leave'
                          ? () => setEditing({ userId: p.userId, name: p.firstName, cell })
                          : undefined
                      }
                    />
                  ))}
                </View>
              ))}
            </Well>
            <Legend
              shifts={week.shifts.filter((s) =>
                week.people.some((p) => p.days.some((d) => d.kind === 'shift' && d.shiftId === s.id)),
              )}
            />
            {!canEdit ? (
              <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>
                {t('rota.readOnly', 'You can see the rota; a rota manager changes it.')}
              </AText>
            ) : null}
          </>
        )}
        </Animated.View>
      </ScrollView>

      {editing && week?.space ? (
        <DaySheet
          person={editing}
          spaceId={week.space.id}
          shifts={week.shifts}
          label={fmt(editing.cell.date, { weekday: 'long', day: 'numeric', month: 'short' })}
          weekday={fmt(editing.cell.date, { weekday: 'long' })}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); seen.current.clear(); void load(); }}
        />
      ) : null}
    </Ground>
  );
}
