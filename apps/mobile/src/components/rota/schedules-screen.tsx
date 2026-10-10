import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { orgHasAddOn, localDateKey, todayKey } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { rotaApi, type RotaCell, type RotaShift, type RotaWeek } from '../../lib/api';
import { useResponsive } from '../../lib/responsive';
import { AText, Ground, HeaderBack, PrimaryButton, ScreenHeader, Well } from '../amazen';
import { centeredContent } from '../screen-container';
import { Banner, JobSheet, SectionLabel } from '../job/job-ui';

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.accent} colors={[c.accent]} />}
      >
        {failed && !week ? <Banner tone="critical" text={t('rota.failed', 'Could not load the schedule. Pull to try again.')} /> : null}

        {week && week.spaces.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: amazen.space(1.5) }}>
            {week.spaces.map((s) => {
              const on = s.id === (spaceId ?? week.space?.id);
              return (
                <Pressable key={s.id} onPress={() => setSpaceId(s.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(2), backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent' }}>
                  <AText variant="caption" numberOfLines={1} style={{ fontSize: 13, color: on ? c.accent : c.ink }}>{s.name}</AText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {shownDays.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
            <RoundArrow label="‹" a11y={t('rota.prevWeek', 'Previous week')} onPress={() => shiftWeek(-1)} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <AText variant="body" tone="strong" style={{ fontSize: 15 }}>{`${fmt(shownDays[0]!, { day: 'numeric', month: 'short' })} – ${fmt(shownDays[6]!, { day: 'numeric', month: 'short' })}`}</AText>
              {shownDays.includes(todayK) ? <SectionLabel tone="accent">{t('rota.thisWeek', 'This week')}</SectionLabel> : null}
            </View>
            <RoundArrow label="›" a11y={t('rota.nextWeek', 'Next week')} onPress={() => shiftWeek(1)} />
          </View>
        ) : null}

        <Animated.View style={{ opacity: fade, gap: amazen.space(3) }} pointerEvents={pending ? 'none' : 'auto'}>
        {!week ? (
          failed ? null : <AText variant="caption" tone="onGlass" style={{ textAlign: 'center', paddingVertical: amazen.space(6) }}>{t('common.loading', 'Loading…')}</AText>
        ) : !week.space ? (
          <Well style={{ padding: amazen.space(5) }}><AText variant="body" tone="ink">{t('rota.noSpaces', 'No workspaces to show.')}</AText></Well>
        ) : week.people.length === 0 ? (
          <Well style={{ padding: amazen.space(5), gap: amazen.space(1) }}>
            <AText variant="body" tone="strong">{t('rota.nobody', { defaultValue: 'Nobody is assigned to {{space}}', space: week.space.name })}</AText>
            {canEdit ? <AText variant="caption" tone="muted">{t('rota.setUpOnWeb', 'Add shifts and people in the workspace’s Attendance settings on the web.')}</AText> : null}
          </Well>
        ) : (
          <>
            <Well style={{ paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(2) }}>
              {/* Header row — the days */}
              <View style={{ flexDirection: 'row', gap: 3, marginBottom: 4 }}>
                <View style={{ width: NAME_W }} />
                {week.days.map((k) => (
                  <View key={k} style={{ flex: 1, alignItems: 'center' }}>
                    <AText numberOfLines={1} style={{ fontFamily: amazen.font.mono, fontSize: 9.5, letterSpacing: 0.8, color: k === todayK ? c.accent : c.inkMuted, textTransform: 'uppercase' }}>
                      {fmt(k, { weekday: 'short' })}
                    </AText>
                    <AText numberOfLines={1} style={{ fontFamily: amazen.font.mono, fontSize: 11, color: k === todayK ? c.accent : c.ink }}>{dayDate(k).getDate()}</AText>
                  </View>
                ))}
              </View>
              {week.people.map((p) => (
                <View key={p.userId} style={{ flexDirection: 'row', gap: 3, marginTop: 3 }}>
                  <View style={{ width: NAME_W, justifyContent: 'center', paddingRight: 4 }}>
                    <AText variant="caption" tone="strong" numberOfLines={1} style={{ fontSize: 12.5 }}>{p.firstName}</AText>
                    {p.position ? <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 10 }}>{p.position}</AText> : null}
                  </View>
                  {p.days.map((cell) => (
                    <Cell
                      key={cell.date}
                      cell={cell}
                      shift={cell.kind === 'shift' ? shiftsById.get(cell.shiftId) : undefined}
                      onPress={canEdit && cell.kind !== 'leave' ? () => setEditing({ userId: p.userId, name: p.firstName, cell }) : undefined}
                    />
                  ))}
                </View>
              ))}
            </Well>
            <Legend shifts={week.shifts.filter((s) => week.people.some((p) => p.days.some((d) => d.kind === 'shift' && d.shiftId === s.id)))} />
            {!canEdit ? (
              <AText variant="caption" tone="onGlass" style={{ textAlign: 'center' }}>{t('rota.readOnly', 'You can see the rota; a rota manager changes it.')}</AText>
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

const NAME_W = 70;
/** "07–15" when on the hour, "07:30–15" otherwise — a cell is 40pt wide. */
const short = (hhmm: string) => (hhmm.endsWith(':00') ? hhmm.slice(0, 2) : hhmm);

function Cell({ cell, shift, onPress }: { cell: RotaCell; shift?: RotaShift; onPress?: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const tint = shift?.color ?? c.accent;
  const style = cell.kind === 'shift'
    ? { backgroundColor: `${tint}33`, color: c.inkStrong }
    : cell.kind === 'schedule'
      ? { backgroundColor: c.tile, color: c.ink }
      : cell.kind === 'leave'
        ? { backgroundColor: c.warnTint, color: c.warn }
        : { backgroundColor: 'transparent', color: c.lineField };
  const text = cell.kind === 'shift' || cell.kind === 'schedule' ? `${short(cell.start)}\n${short(cell.end)}` : cell.kind === 'leave' ? t('rota.leaveCell', 'Leave') : '—';
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: style.backgroundColor, opacity: pressed ? 0.7 : 1, borderWidth: cell.kind === 'shift' && cell.source === 'once' ? 1 : 0, borderColor: tint })}>
      <AText numeric style={{ fontFamily: amazen.font.mono, fontSize: 10, lineHeight: 13, textAlign: 'center', color: style.color }}>{text}</AText>
    </Pressable>
  );
}

function Legend({ shifts }: { shifts: RotaShift[] }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const item = (swatch: string, label: string, border?: string) => (
    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: swatch, borderWidth: border ? 1 : 0, borderColor: border }} />
      <AText variant="caption" tone="onGlass" style={{ fontSize: 11 }}>{label}</AText>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(3), paddingHorizontal: amazen.space(1) }}>
      {shifts.map((s) => item(`${s.color ?? c.accent}55`, `${s.name} ${s.startLocal}–${s.endLocal}`))}
      {item(c.tile, t('rota.legendSchedule', 'Weekly schedule (no rota)'))}
      {item(c.warnTint, t('rota.legendLeave', 'Time off'))}
      {item('transparent', t('rota.legendOnce', 'This day only'), c.accent)}
    </View>
  );
}

function RoundArrow({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const { amazen } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: amazen.color.tile, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
      <AText variant="body" tone="strong" style={{ fontSize: 20, lineHeight: 24 }}>{label}</AText>
    </Pressable>
  );
}

/** One person, one day: a shift or off, that day only or every week from then. */
function DaySheet({
  person, spaceId, shifts, label, weekday, onClose, onSaved,
}: {
  person: { userId: string; name: string; cell: RotaCell };
  spaceId: string;
  shifts: RotaShift[];
  label: string;
  weekday: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const now = person.cell.kind === 'shift' ? person.cell.shiftId : null;
  const [choice, setChoice] = useState<string | null>(now);
  const [repeat, setRepeat] = useState<'once' | 'weekly'>('once');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    ⚠️ Said before Save, not after: a single day off from a standing shift is
    time off, and the server refuses it for that reason.
  */
  const offOnceBlocked = choice === null && repeat === 'once' && person.cell.kind === 'shift' && person.cell.source === 'weekly';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await rotaApi.setDay({ spaceId, userId: person.userId, date: person.cell.date, shiftId: choice, repeat });
      onSaved();
    } catch (e) {
      setError((e as Error)?.message || t('rota.saveFailed', 'Could not save the change.'));
    } finally {
      setBusy(false);
    }
  };

  const option = (id: string | null, name: string, hours?: string, color?: string | null) => {
    const on = choice === id;
    return (
      <Pressable key={id ?? 'off'} onPress={() => setChoice(id)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), padding: amazen.space(3.25), borderRadius: 16, backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent' }}>
        <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: id ? color ?? c.accent : c.lineField }} />
        <AText variant="body" tone="strong" style={{ flex: 1, fontSize: 14.5 }}>{name}</AText>
        {hours ? <AText variant="caption" tone="muted" numeric>{hours}</AText> : null}
      </Pressable>
    );
  };

  return (
    <JobSheet visible onClose={onClose} busy={busy} title={`${person.name} · ${label}`}>
      <View style={{ gap: amazen.space(2) }}>
        {shifts.map((s) => option(s.id, s.name, `${s.startLocal}–${s.endLocal}`, s.color))}
        {option(null, t('rota.off', 'Off'))}
      </View>
      <View style={{ flexDirection: 'row', gap: amazen.space(1.5) }}>
        {(['once', 'weekly'] as const).map((k) => {
          const on = repeat === k;
          return (
            <Pressable key={k} onPress={() => setRepeat(k)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(2), backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent' }}>
              <AText variant="caption" style={{ fontSize: 13, color: on ? c.accent : c.ink }}>
                {k === 'once' ? t('rota.once', 'This day only') : t('rota.weekly', { defaultValue: 'Every {{weekday}}', weekday })}
              </AText>
            </Pressable>
          );
        })}
      </View>
      {offOnceBlocked ? <Banner tone="warn" text={t('rota.offOnceNeedsLeave', 'A single day off from a standing shift is time off — approve leave for it, or set it off every week.')} /> : null}
      {error ? <Banner tone="critical" text={error} /> : null}
      <PrimaryButton label={t('common.save', 'Save')} onPress={() => void save()} disabled={offOnceBlocked || (choice === now && repeat === 'once')} loading={busy} />
    </JobSheet>
  );
}
