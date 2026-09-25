import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { hasAccessModule, type FlowStatus } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { useLocationTrackingContext } from '../../contexts/location-tracking-context';
import { useHomeTasks } from '../../offline/tasks/use-home-tasks';
import { useOffline } from '../../offline/offline-context';
import { changeTaskStatus } from '../../offline/tasks/task-actions';
import { takeStatusFix, outboxFix, taskDestination } from '../../offline/tasks/status-fix';
import { isUnreachable } from '../../offline/actions/unreachable';
import { FreshnessLabel } from '../../offline/components/freshness-label';
import { SyncChip } from '../../offline/components/sync-chip';
import { useShift } from '../../offline/attendance/use-shift';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { scheduleApi } from '../../lib/api';
import type { ScheduleEntry, Task } from '../../lib/api/types';
import { AText, Eyebrow, Well, WellDivider } from '../amazen';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import {
  AcceptGlyph, OnMyWayGlyph, ArrivedGlyph, StartWorkGlyph, FinishGlyph, NavigateGlyph, MoreGlyph,
} from '../glyphs/work-glyphs';
import type { GlyphProps } from '../glyphs/glyphs';
import {
  shapeFor, faceFor, viewAllSpaceIds, weekOf, sameDay, startOfDay, tasksOn, hasHour, isMine,
  flowIdOf, stepsFor, isClosed, decisionFor, routeFor, shiftOn, shiftHours, nextJobAfter, figuresFor,
  type Decision,
} from './my-work';

/**
 * My work — `docs/design/my-work/`. Today's jobs, this week and the next job
 * in one card: a week strip that changes the list, a first row that carries
 * its decision, and plain rows under it.
 *
 * ⚠️ NO NEW ENDPOINT. Jobs come through `useHomeTasks()` (the phone's rows
 * with unsent changes on top — never `tasksApi.list()`), shift bars from the
 * member's OWN weekly schedule, and the verb goes through the same outbox
 * action as the task screen, `changeTaskStatus`.
 *
 * ⚠️ A WELL, NOT GLASS. This is a list, and a list over a gradient is what
 * dies in sunlight.
 */
export function MyWorkCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { user } = useAuth();
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const offline = useOffline();
  const shift = useShift();
  const c = amazen.color;
  const { tasks, updatedAt, load } = useHomeTasks();

  const shape = shapeFor({
    tasks: hasAccessModule(user ?? {}, 'tasks'),
    clock: hasAccessModule(user ?? {}, 'clock'),
  });
  const face = faceFor({
    role: user?.role ?? null,
    canViewAllTasks: user?.canViewAllTasks,
    viewAllSpaceIds: viewAllSpaceIds(user?.access?.perSpace as Record<string, unknown> | undefined),
  });

  /*
    ⚠️ SEVEN STATES, THREE OF THEM EMPTY — STATES.md. `load()` throws only
    when `listFailureIsFatal` says so, and what it threw decides which
    sentence: a refusal is ⑥, nothing answering with nothing to show is ⑦.
    "Nothing scheduled" is only ever said when the list really loaded.
  */
  const [phase, setPhase] = useState<'opening' | 'ready' | 'refused' | 'absent'>('opening');
  const fetchList = useCallback(async () => {
    try { await load(); setPhase('ready'); }
    catch (err) { setPhase(isUnreachable(err) ? 'absent' : 'refused'); }
  }, [load]);
  /*
    ⚠️ ON EVERY RETURN TO HOME, NOT ONLY ON MOUNT. The home stays mounted
    under the other tabs, so a card that asked once when the app opened kept
    showing that morning's copy: jobs created since simply were not there
    (08.png). `load()` reads the phone's copy AND kicks a background pull.
  */
  useFocusEffect(useCallback(() => {
    if (shape !== 'none' && shape !== 'shifts') void fetchList();
  }, [fetchList, shape]));
  // Rows arriving from the phone's copy mean it has loaded, whatever load() is still doing.
  useEffect(() => { if (tasks.length > 0 && phase === 'opening') setPhase('ready'); }, [tasks.length, phase]);

  /*
    The shift bars — the member's own weekly schedule. `GET /employees/:id/
    schedule` answers ADMIN and EMPLOYEE about themselves; the availability
    board is a supervisor's endpoint and would 403 a member.
    ⚠️ No schedule (offline, or none set) draws no bars. Never invented ones.
  */
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  useEffect(() => {
    if (!user?.id || (shape !== 'both' && shape !== 'shifts')) return;
    let live = true;
    scheduleApi.getMine(user.id).then((s) => { if (live) setSchedule(s); }).catch(() => undefined);
    return () => { live = false; };
  }, [user?.id, shape]);

  /*
    The workflows the rows run on, from the offline engine's copy — the same
    lookup the task screen does. A row whose workflow is not here offers no
    verb (it opens the job) rather than guessing the field-service one.
  */
  const flowIds = useMemo(() => [...new Set(tasks.map(flowIdOf).filter((x): x is string => !!x))].sort().join(','), [tasks]);
  const [flows, setFlows] = useState<Map<string, unknown>>(() => new Map());
  useEffect(() => {
    const records = offline.records;
    if (!records || !flowIds) return;
    let live = true;
    void (async () => {
      const next = new Map<string, unknown>();
      for (const id of flowIds.split(',')) {
        const row = await records.get<unknown>('workflows', id).catch(() => null);
        if (row?.data) next.set(id, row.data);
      }
      if (live) setFlows(next);
    })();
    return () => { live = false; };
  }, [offline.records, flowIds]);

  // Today on mount, always. Selecting a day is a READ.
  const [selected, setSelected] = useState<Date>(() => startOfDay(new Date()));
  const week = useMemo(() => weekOf(new Date()), []);
  const today = startOfDay(new Date());

  const open = useCallback((task: Task) => !isClosed(task, stepsFor(task, flows)), [flows]);
  const dayTasks = useMemo(() => (shape === 'shifts' ? [] : tasksOn(tasks, selected)), [shape, tasks, selected]);
  const dots = useMemo(() => week.map((d) => (shape === 'shifts' ? 0 : tasksOn(tasks, d).length)), [shape, tasks, week]);

  /* ⚠️ MINE ALWAYS LEADS. */
  const { mine, theirs } = useMemo(() => {
    if (face === 'executor') return { mine: dayTasks, theirs: [] as Task[] };
    return { mine: dayTasks.filter((x) => isMine(x, user?.id)), theirs: dayTasks.filter((x) => !isMine(x, user?.id)) };
  }, [dayTasks, face, user?.id]);

  const active = useMemo(() => (phase === 'opening' ? null : mine.find((x) => isMine(x, user?.id) && open(x)) ?? null), [mine, user?.id, open, phase]);
  const decision = active ? decisionFor(active, user?.id, stepsFor(active, flows)) : null;

  /* ---------------- the verb ---------------- */
  const toast = useToast();
  const { startTracking, stopTracking } = useLocationTrackingContext();
  const [busy, setBusy] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<Task | null>(null);
  const busyRef = useRef(false);

  const openTask = useCallback((task: Task) => router.push(`/task/${task.id}` as Href), [router]);

  const run = useCallback(async (task: Task, to: FlowStatus) => {
    setMenuFor(null);
    /* BLOCKED needs a reason and a reporting finish needs the report — the task screen asks for both. */
    if (routeFor(task, to, flows) === 'open' || !offline.engine) { openTask(task); return; }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(task.id);
    const leaving = task.status === 'EN_ROUTE' && to.key === 'ARRIVED';
    try {
      if (leaving) stopTracking();
      if (to.key === 'EN_ROUTE') void startTracking(task.id, taskDestination(task));
      const fix = await takeStatusFix(to.key);
      const outcome = await changeTaskStatus(offline.engine, { taskId: task.id, from: task.status, to: to.key, fix: outboxFix(fix) });
      if (outcome.kind === 'refused') {
        if (leaving) void startTracking(task.id, taskDestination(task));
        if (to.key === 'EN_ROUTE') stopTracking();
        toast.error(
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('taskDetail.failedToUpdateStatus'),
        );
        return;
      }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
      else toast.success(to.label, task.title);
      void load().catch(() => undefined);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, [flows, offline.engine, openTask, startTracking, stopTracking, toast, t, load]);

  /*
    ⚠️ THE EARLY EXIT IS BELOW EVERY HOOK. Holding neither module means the
    widget does not render — but a return above a hook changes how many hooks
    run between renders the day somebody's modules change.
  */
  if (shape === 'none') return null;

  const todayShift = sameDay(selected, today) && shift.status?.isClockedIn ? shift.status.currentEntry : null;
  const selShift = shiftOn(schedule, selected);
  const pillCount = shape === 'shifts' ? schedule.filter((e) => e.isActive).length : dayTasks.length;

  return (
    <View style={style}>
      <Well style={{ padding: amazen.space(4.5), gap: amazen.space(3) }}>
        {/* The header. The pill goes to the whole list; the card itself is not a target. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <AText variant="h3" tone="strong" style={{ flex: 1 }}>{t('widgets.myWork', { defaultValue: 'My work' })}</AText>
          <FreshnessLabel at={updatedAt} />
          {phase === 'ready' || shape === 'shifts' ? (
            <Pressable
              onPress={() => router.push((shape === 'shifts' ? '/(app)/(tabs)/attendance' : '/(app)/(tabs)/tasks') as Href)}
              accessibilityRole="button"
              hitSlop={8}
              style={{ paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(1.5), borderRadius: amazen.radius.full, backgroundColor: c.tile }}
            >
              <AText variant="caption" tone="strong">{t('myWork.all', { count: pillCount, defaultValue: `All ${pillCount}` })} ›</AText>
            </Pressable>
          ) : null}
        </View>

        {/* The strip. An empty week is information — it renders regardless. */}
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {week.map((d, i) => {
            const on = sameDay(d, selected);
            const flat = phase === 'absent';
            const bar = !flat && shape !== 'tasks' && !!shiftOn(schedule, d);
            const n = flat ? 0 : Math.min(3, dots[i] ?? 0);
            return (
              <Pressable
                key={d.toISOString()}
                onPress={() => setSelected(startOfDay(d))}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={d.toLocaleDateString(undefined, { weekday: 'long' })}
                style={{
                  flex: 1, height: 54, borderRadius: amazen.radius.full,
                  alignItems: 'center', justifyContent: 'center', gap: 4,
                  backgroundColor: on ? c.accentTint : 'transparent',
                  borderWidth: on ? 1.5 : 0, borderColor: on ? c.accent : 'transparent',
                }}
              >
                <AText variant="caption" tone={on ? 'strong' : 'muted'}>{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</AText>
                <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: bar ? (on ? c.accent : c.inkMuted) : 'transparent' }} />
                <View style={{ flexDirection: 'row', gap: 2, height: 4 }}>
                  {Array.from({ length: n }).map((_, k) => (
                    <View key={k} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: on ? c.accent : c.ink }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {phase === 'refused' && shape !== 'shifts' ? (
          <Sentence tone="critical" title={t('myWork.refused', { defaultValue: 'Could not load your jobs.' })} body={t('myWork.refusedBody', { defaultValue: 'The office refused the request.' })}>
            <Pressable onPress={() => { setPhase('opening'); void fetchList(); }} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: amazen.space(2), paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(1.5), borderRadius: amazen.radius.full, backgroundColor: c.tile }}>
              <AText variant="caption" tone="strong">{t('common.retry', { defaultValue: 'Retry' })}</AText>
            </Pressable>
          </Sentence>
        ) : phase === 'absent' && shape !== 'shifts' ? (
          /* ⚠️ ⑦ — the opposite of "Nothing scheduled". Nothing answered, and this phone never held a copy. */
          <Sentence tone="warn" title={t('myWork.absent', { defaultValue: 'Your jobs are not on this phone yet.' })} body={t('myWork.absentBody', { defaultValue: 'Connect once and they will be here next time, signal or not.' })} />
        ) : (
          <>
            <Eyebrow tone="accent">
              {dayEyebrow(selected, today, t)}
              {shape === 'tasks' && dayTasks.length > 0 ? ` · ${t('myWork.jobs', { count: dayTasks.length, defaultValue: `${dayTasks.length} jobs` })}` : ''}
              {shape === 'both' && selShift ? ` · ${shiftHours(selShift)}h` : ''}
              {shape === 'both' && todayShift?.location?.name ? ` · ${todayShift.location.name}` : ''}
            </Eyebrow>

            {shape === 'shifts' ? (
              <ShiftList schedule={schedule} selected={selected} today={today} live={todayShift} onOpen={() => router.push('/(app)/(tabs)/attendance' as Href)} />
            ) : phase === 'opening' ? (
              <View style={{ gap: amazen.space(2.5), paddingVertical: amazen.space(1) }}>
                {[88, 64, 76].map((w) => <View key={w} style={{ width: `${w}%`, height: 12, borderRadius: 6, backgroundColor: c.tile }} />)}
              </View>
            ) : (
              <>
                {face !== 'executor' ? <Eyebrow tone="muted">{t('myWork.mine', { count: mine.length, defaultValue: `Mine · ${mine.length}` })}</Eyebrow> : null}
                {mine.length === 0 && (face === 'executor' || theirs.length === 0) ? (
                  <Sentence
                    title={sameDay(selected, today)
                      ? t('myWork.nothingToday', { defaultValue: 'Nothing scheduled today.' })
                      : t('myWork.nothingOn', { day: selected.toLocaleDateString(undefined, { weekday: 'long' }), defaultValue: `Nothing scheduled on ${selected.toLocaleDateString(undefined, { weekday: 'long' })}.` })}
                    body={nextJobLine(nextJobAfter(face === 'executor' ? tasks : tasks.filter((x) => isMine(x, user?.id)), selected, open), t)}
                  />
                ) : null}
                {active ? (
                  <ActiveRow
                    task={active}
                    decision={decision}
                    busy={busy === active.id}
                    onVerb={(to) => void run(active, to)}
                    onMore={() => setMenuFor(active)}
                    onOpen={() => openTask(active)}
                  />
                ) : null}
                {mine.filter((x) => x !== active).map((task) => (
                  <PlainRow key={task.id} task={task} done={!open(task)} mine={face !== 'executor'} onPress={() => openTask(task)} />
                ))}

                {face === 'spaceSupervisor' && theirs.length > 0 ? (
                  <>
                    <Eyebrow tone="muted" style={{ marginTop: amazen.space(2) }}>{siteLabel(theirs, t)}</Eyebrow>
                    {theirs.slice(0, 3).map((task) => <PlainRow key={task.id} task={task} done={!open(task)} mine={false} onPress={() => openTask(task)} />)}
                    {theirs.length > 3 ? (
                      <Pressable onPress={() => router.push('/(app)/(tabs)/tasks' as Href)} accessibilityRole="button" hitSlop={6}>
                        <AText variant="caption" tone="accent">{t('myWork.more', { count: theirs.length - 3, defaultValue: `+${theirs.length - 3} more` })}</AText>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}

                {face === 'orgWide' && theirs.length > 0 ? <Figures others={theirs} open={open} onPress={() => router.push('/(app)/(tabs)/tasks' as Href)} /> : null}
              </>
            )}
          </>
        )}
      </Well>

      {/* ⋯ — every other transition, and the job itself. One slot, one panel. */}
      <BlurSheet visible={!!menuFor} onClose={() => setMenuFor(null)}>
        <SheetPanel title={menuFor?.title} onClose={() => setMenuFor(null)}>
          <View style={{ gap: amazen.space(2), paddingTop: amazen.space(2) }}>
            {menuFor ? (decisionFor(menuFor, user?.id, stepsFor(menuFor, flows))?.rest ?? []).map((s) => (
              <SheetButton key={s.key} label={s.key === 'BLOCKED' ? t('myWork.reportIssue', { defaultValue: 'Report an issue' }) : s.label} tone={s.key === 'BLOCKED' ? 'critical' : 'strong'} onPress={() => void run(menuFor, s)} />
            )) : null}
            {menuFor ? <SheetButton label={t('myWork.openJob', { defaultValue: 'Open the job' })} onPress={() => { const x = menuFor; setMenuFor(null); openTask(x); }} /> : null}
          </View>
        </SheetPanel>
      </BlurSheet>
    </View>
  );
}

/* ---------------- parts ---------------- */

/** The marks map to the TRANSITION, never the wording — labels are organization-authored. */
const MARKS: Record<string, React.ComponentType<GlyphProps>> = {
  ACCEPTED: AcceptGlyph,
  EN_ROUTE: OnMyWayGlyph,
  ARRIVED: ArrivedGlyph,
  IN_PROGRESS: StartWorkGlyph,
  COMPLETED: FinishGlyph,
};

/**
 * The first open job of the day, WHEN IT IS THE READER'S OWN — raised one step
 * out of the well and carrying its decision.
 */
function ActiveRow({ task, decision, busy, onVerb, onMore, onOpen }: {
  task: Task;
  decision: Decision | null;
  busy: boolean;
  onVerb: (to: FlowStatus) => void;
  onMore: () => void;
  onOpen: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatTime } = useTimeFormat();
  const c = amazen.color;

  /* ⚠️ Coordinates are coerced before they go into a URL; zero is a legal coordinate. */
  const lat = Number(task.locationLat);
  const lng = Number(task.locationLng);
  const canNavigate = task.locationLat != null && task.locationLng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const moving = task.status === 'ACCEPTED' || task.status === 'EN_ROUTE';
  const navigate = () => {
    const url = Platform.select({ ios: `maps:0,0?daddr=${lat},${lng}`, android: `google.navigation:q=${lat},${lng}` });
    if (url) void Linking.openURL(url).catch(() => Linking.openURL(`geo:${lat},${lng}`));
  };

  const Mark = decision ? MARKS[decision.primary.key] ?? (decision.primary.isFinal ? FinishGlyph : null) : null;
  const meta = [
    hasHour(task.dueDate) ? formatTime(task.dueDate!) : null,
    task.locationAddress,
    (task as unknown as { space?: { name?: string } }).space?.name,
  ].filter(Boolean).join(' · ');

  return (
    <View style={{ backgroundColor: c.tile, borderRadius: 20, padding: amazen.space(3.5), gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: c.accent, backgroundColor: task.status === 'ASSIGNED' ? 'transparent' : c.accent }} />
        <Eyebrow tone="muted" style={{ flexShrink: 1 }}>{decision?.current.label ?? task.status.replace(/_/g, ' ')}</Eyebrow>
        <SyncChip entityId={task.id} />
      </View>
      <Pressable onPress={onOpen} accessibilityRole="link" hitSlop={4}>
        <AText variant="h3" tone="strong" numberOfLines={2}>{task.title}</AText>
        {meta ? <AText variant="caption" tone="muted" numberOfLines={1}>{meta}</AText> : null}
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2), marginTop: amazen.space(2) }}>
        {decision ? (
          <Pressable
            onPress={busy ? undefined : () => onVerb(decision.primary)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={decision.primary.label}
            accessibilityState={{ busy }}
            style={({ pressed }) => ({ flex: 1, borderRadius: amazen.radius.full, overflow: 'hidden', opacity: busy ? 0.6 : pressed ? 0.88 : 1 })}
          >
            <LinearGradient
              colors={amazen.gradient.primary as unknown as [string, string, ...string[]]}
              style={{ minHeight: amazen.layout.tapMin, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: amazen.space(2), paddingHorizontal: amazen.space(4) }}
            >
              {Mark ? <Mark size={18} color={c.accentInk} contrast={amazen.gradient.primary[1]} /> : null}
              <AText variant="body" tone="accentInk" style={{ fontFamily: amazen.type.h3.fontFamily }} numberOfLines={1}>{decision.primary.label}</AText>
            </LinearGradient>
          </Pressable>
        ) : (
          /* A workflow this phone does not hold: open the job rather than guess its verbs. */
          <Pressable onPress={onOpen} accessibilityRole="button" style={{ flex: 1, minHeight: amazen.layout.tapMin, borderRadius: amazen.radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentTint }}>
            <AText variant="body" tone="accent">{t('myWork.openJob', { defaultValue: 'Open the job' })}</AText>
          </Pressable>
        )}
        {canNavigate && moving ? (
          <RoundButton Glyph={NavigateGlyph} jade label={t('taskDetail.navigate', { defaultValue: 'Navigate' })} onPress={navigate} />
        ) : null}
        {decision ? <RoundButton Glyph={MoreGlyph} label={t('myWork.moreActions', { defaultValue: 'More actions' })} onPress={onMore} /> : null}
      </View>
    </View>
  );
}

/** A 40pt disc inside the active row. Discs keep their word for the screen reader. */
function RoundButton({ Glyph, label, jade, onPress }: { Glyph: React.ComponentType<GlyphProps>; label: string; jade?: boolean; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: jade ? c.accentTint : c.tile, opacity: pressed ? 0.8 : 1 })}
    >
      <Glyph size={20} color={jade ? c.accent : c.inkStrong} contrast={c.well} />
    </Pressable>
  );
}

function PlainRow({ task, done, mine, onPress }: { task: Task; done: boolean; mine: boolean; onPress: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatTime } = useTimeFormat();
  const c = amazen.color;
  const who = !mine && task.assignedTo ? task.assignedTo.firstName : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2.5), paddingVertical: amazen.space(2), opacity: pressed ? 0.7 : 1 })}
    >
      {/* Solid = yours, hollow ring = somebody else's. */}
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: mine || !who ? (done ? c.inkMuted : c.accent) : 'transparent', borderWidth: mine || !who ? 0 : 1.5, borderColor: c.inkMuted }} />
      <AText variant="body" tone={done ? 'muted' : 'strong'} numberOfLines={1} style={{ flex: 1, textDecorationLine: done ? 'line-through' : 'none' }}>
        {who ? <AText variant="body" tone="muted">{who} · </AText> : null}
        {task.title}
      </AText>
      <SyncChip entityId={task.id} />
      <AText variant="caption" tone="muted" numeric>
        {done ? t('myWork.done', { defaultValue: 'done' }) : hasHour(task.dueDate) ? formatTime(task.dueDate!) : ''}
      </AText>
    </Pressable>
  );
}

/** Clock-only: the active row IS the shift, and the week's other shifts sit under it. */
function ShiftList({ schedule, selected, today, live, onOpen }: {
  schedule: ScheduleEntry[];
  selected: Date;
  today: Date;
  live: { clockInAt?: string; location?: { name?: string } | null } | null | undefined;
  onOpen: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatTime } = useTimeFormat();
  const c = amazen.color;
  const sel = shiftOn(schedule, selected);
  const week = weekOf(today);
  const others = week.filter((d) => !sameDay(d, selected) && shiftOn(schedule, d));
  return (
    <>
      <Pressable onPress={onOpen} accessibilityRole="button" style={{ backgroundColor: c.tile, borderRadius: 20, padding: amazen.space(3.5), gap: 4 }}>
        {live ? (
          <>
            <Eyebrow tone="accent">{t('myWork.onTheClock', { defaultValue: 'On the clock' })}</Eyebrow>
            <AText variant="h3" tone="strong">{live.location?.name ?? t('myWork.shift', { defaultValue: 'Shift' })}</AText>
            <AText variant="caption" tone="muted" numeric>
              {live.clockInAt ? t('myWork.since', { time: formatTime(live.clockInAt), defaultValue: `since ${formatTime(live.clockInAt)}` }) : ''}
              {sel ? ` · ${sel.startTime} → ${sel.endTime}` : ''}
            </AText>
          </>
        ) : sel ? (
          <>
            <Eyebrow tone="muted">{t('myWork.shift', { defaultValue: 'Shift' })}</Eyebrow>
            <AText variant="h3" tone="strong" numeric>{sel.startTime} → {sel.endTime}</AText>
            <AText variant="caption" tone="muted">{t('myWork.hours', { count: shiftHours(sel), defaultValue: `${shiftHours(sel)} h` })}</AText>
          </>
        ) : (
          <AText variant="body" tone="muted">
            {t('myWork.noShift', { day: selected.toLocaleDateString(undefined, { weekday: 'long' }), defaultValue: `No shift on ${selected.toLocaleDateString(undefined, { weekday: 'long' })}.` })}
          </AText>
        )}
      </Pressable>
      {others.map((d, i) => {
        const e = shiftOn(schedule, d)!;
        return (
          <React.Fragment key={d.toISOString()}>
            {i > 0 ? <WellDivider /> : null}
            <Pressable onPress={onOpen} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2.5), paddingVertical: amazen.space(2) }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: d < today ? c.inkMuted : c.accent }} />
              <AText variant="body" tone="strong" style={{ flex: 1 }}>{d.toLocaleDateString(undefined, { weekday: 'long' })}</AText>
              <AText variant="caption" tone="muted" numeric>{e.startTime} → {e.endTime}</AText>
            </Pressable>
          </React.Fragment>
        );
      })}
    </>
  );
}

/** Org-wide: reach changes the FORM, not the length. */
function Figures({ others, open, onPress }: { others: Task[]; open: (t: Task) => boolean; onPress: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const f = figuresFor(others, open);
  const cell = (n: number, label: string, tone: 'strong' | 'critical' | 'warn') => (
    <View style={{ flex: 1 }}>
      <AText variant="decimal" tone={n > 0 ? tone : 'muted'} numeric>{n}</AText>
      <AText variant="caption" tone="muted">{label}</AText>
    </View>
  );
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ gap: amazen.space(2), marginTop: amazen.space(2) }}>
      <Eyebrow tone="muted">{t('myWork.across', { count: f.sites, defaultValue: `Across ${f.sites} sites` })}</Eyebrow>
      <View style={{ flexDirection: 'row' }}>
        {cell(f.open, t('myWork.open', { defaultValue: 'open' }), 'strong')}
        {cell(f.urgent, t('myWork.urgent', { defaultValue: 'urgent' }), 'critical')}
        {cell(f.unassigned, t('myWork.nobodyOn', { defaultValue: 'nobody on' }), 'warn')}
      </View>
    </Pressable>
  );
}

function Sentence({ title, body, tone = 'strong', children }: { title: string; body?: string; tone?: 'strong' | 'critical' | 'warn'; children?: React.ReactNode }) {
  return (
    <View style={{ gap: 2, paddingVertical: 4 }}>
      <AText variant="body" tone={tone} style={{ fontWeight: '500' }}>{title}</AText>
      {body ? <AText variant="caption" tone="muted">{body}</AText> : null}
      {children}
    </View>
  );
}

function SheetButton({ label, tone = 'strong', onPress }: { label: string; tone?: 'strong' | 'critical'; onPress: () => void }) {
  const { amazen } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ borderRadius: 14, padding: amazen.space(3.5), backgroundColor: amazen.color.tile, opacity: pressed ? 0.8 : 1 })}>
      <AText variant="body" tone={tone}>{label}</AText>
    </Pressable>
  );
}

type T = (k: string, o?: Record<string, unknown>) => string;

function dayEyebrow(d: Date, today: Date, t: T): string {
  if (sameDay(d, today)) return t('common.today', { defaultValue: 'Today' });
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, tomorrow)) return t('common.tomorrow', { defaultValue: 'Tomorrow' });
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

function nextJobLine(next: Task | null, t: T): string {
  if (!next?.dueDate) return t('myWork.nothingAhead', { defaultValue: 'Nothing else is scheduled yet.' });
  const d = new Date(next.dueDate);
  const day = d.toLocaleDateString(undefined, { weekday: 'long' });
  return hasHour(next.dueDate)
    ? t('myWork.nextAt', { day, time: d.toTimeString().slice(0, 5), defaultValue: `Your next job is ${day} at ${d.toTimeString().slice(0, 5)}.` })
    : t('myWork.nextOn', { day, defaultValue: `Your next job is ${day}.` });
}

function siteLabel(theirs: Task[], t: T): string {
  const names = new Set(theirs.map((x) => (x as unknown as { space?: { name?: string } }).space?.name).filter(Boolean));
  const name = names.size === 1 ? [...names][0]! : t('myWork.yourSites', { defaultValue: 'Your sites' });
  return `${name} · ${theirs.length}`;
}
