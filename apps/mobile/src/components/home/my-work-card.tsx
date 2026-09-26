import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Animated as RNAnimated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { daysLate, hasAccessModule } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useHomeTasks } from '../../offline/tasks/use-home-tasks';
import { useConnectivity, useOffline } from '../../offline/offline-context';
import { isUnreachable } from '../../offline/actions/unreachable';
import { knownOffline } from '../../offline/connectivity';
import { FreshnessLabel } from '../../offline/components/freshness-label';
import { SyncChip } from '../../offline/components/sync-chip';
import { useShift } from '../../offline/attendance/use-shift';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { weekdayName } from '../../lib/app-dates';
import { scheduleApi, tasksApi } from '../../lib/api';
import type { ScheduleEntry, Task } from '../../lib/api/types';
import { AText, Eyebrow, CardSurface, WellDivider } from '../amazen';
import { LinearGradient } from 'expo-linear-gradient';
import { usePitch } from '../../home/pitch';
import {
  shapeFor, faceFor, viewAllSpaceIds, weekOf, sameDay, startOfDay, tasksOn, hasHour, isMine,
  flowIdOf, stepsFor, isClosed, isUnderWay, shiftOn, shiftHours, nextJobAfter, figuresFor, todaysOwn,
  msUntilNextDay, withoutCanceled, stepLabelFor,
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
  const { formatTime } = useTimeFormat();
  /*
    ⚠️ THE CARD'S CLOCK IS THE PHONE'S, LIKE ITS DAYS. Days, "late" and the
    midnight-means-no-hour rule are all read in the phone's zone; the hour was
    printed in the organization's zone WITH its label ("09:00 CEST", and in
    12h "9:00 AM GMT+2", which the label-stripper does not recognise). A phone
    away from the office then put a job on one day and printed the hour of
    another. `null` = local, no label.
  */
  const clock = useCallback((d: string | Date) => formatTime(d, null), [formatTime]);
  const router = useRouter();
  const offline = useOffline();
  const shift = useShift();
  /*
    ⚠️ This card reads the shift too, and it did not refresh it — only the
    Shift clock card did. Without that card on the home, "on shift" here was
    the last SAVED shift, up to a day old. Focus, resume and reconnect; an
    identical request already in flight is joined by the API client.
  */
  useLiveRefresh(shift.refresh, null, { onReconnect: true });
  const c = amazen.color;
  const { tasks: held, updatedAt, loaded, load } = useHomeTasks();

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
    /*
      ⚠️ `ready` ONLY WHEN A LIST IS ON SCREEN. `load()` returns quietly when
      nothing answered while the phone's database is still opening, and this
      used to read that as ready: a cold start in a basement said "Nothing
      scheduled today" over the member's day — for good, on a phone whose copy
      turned out to be empty of this week. `opening` holds until the copy
      lands (the effect below) or the database settles the question.
    */
    try { if (await load()) setPhase('ready'); }
    catch (err) { setPhase(isUnreachable(err) ? 'absent' : 'refused'); }
  }, [load]);
  /*
    ⚠️ "TODAY" MOVES. It was memoised once on mount, and the home stays
    mounted under the other tabs — so a phone that opened the app before
    midnight kept highlighting yesterday, listing yesterday's jobs as today's
    and counting "late" from the wrong day until the app was killed. Re-read
    on every return to home, on every return from the background, and at the
    turn of the day while the card is on screen. The selection follows only
    when it was on today; a day the member picked stays picked.
  */
  const [todayMs, setTodayMs] = useState(() => startOfDay(new Date()).getTime());
  const todayRef = useRef(todayMs);
  const [selected, setSelected] = useState<Date>(() => new Date(todayRef.current));
  const syncDay = useCallback(() => {
    const now = startOfDay(new Date()).getTime();
    const was = todayRef.current;
    if (now === was) return;
    todayRef.current = now;
    setTodayMs(now);
    setSelected((s) => (s.getTime() === was ? new Date(now) : s));
  }, []);
  useEffect(() => {
    const timer = setTimeout(syncDay, msUntilNextDay() + 1000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') syncDay(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, [todayMs, syncDay]);

  /*
    ⚠️ ON EVERY RETURN TO HOME, NOT ONLY ON MOUNT. The home stays mounted
    under the other tabs, so a card that asked once when the app opened kept
    showing that morning's copy: jobs created since simply were not there
    (08.png). `load()` reads the phone's copy AND kicks a background pull.
  */
  useFocusEffect(useCallback(() => {
    syncDay();
    if (shape !== 'none' && shape !== 'shifts') void fetchList();
  }, [fetchList, shape, syncDay]));
  // The phone's copy arriving means it has loaded, whatever load() is still doing — an empty copy too.
  useEffect(() => { if (loaded && phase === 'opening') setPhase('ready'); }, [loaded, phase]);
  /*
    ⚠️ THE DATABASE FINISHED OPENING WITH THE CARD STILL WAITING: ask once more.
    Now there is either a copy (ready) or there will never be one this launch,
    and nothing answering is then ⑦, not a spinner forever.
  */
  const opening = offline.starting;
  const wasOpening = useRef(opening);
  useEffect(() => {
    // The transition only — on mount the focus effect above has already asked.
    const settled = wasOpening.current && !opening;
    wasOpening.current = opening;
    if (settled && phase === 'opening' && shape !== 'none' && shape !== 'shifts') void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the database settles
  }, [opening]);

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
  const flowIds = useMemo(() => [...new Set(held.map(flowIdOf).filter((x): x is string => !!x))].sort().join(','), [held]);
  const [flows, setFlows] = useState<Map<string, unknown>>(() => new Map());
  /*
    ⚠️ A workflow that could not be asked for offline is asked again when the
    signal returns — keyed on the set of ids alone, it waited for the NEXT
    job on a new workflow, and until then its rows could only open the job.
  */
  const online = useConnectivity() === 'online';
  useEffect(() => {
    if (!flowIds) return;
    const records = offline.records;
    let live = true;
    void (async () => {
      const next = new Map<string, unknown>();
      for (const id of flowIds.split(',')) {
        const row = records ? await records.get<unknown>('workflows', id).catch(() => null) : null;
        if (row?.data) { next.set(id, row.data); continue; }
        /*
          ⚠️ NOT ON THIS PHONE — ASK THE JOB. The phone's copy of workflows can
          lag its copy of tasks (the iPhone showed "Open the job" where the
          emulator showed "Arrived", 02.png / 21:20). `GET /tasks/:id` already
          carries the job's full workflow, so one job per missing workflow is
          asked for it. Offline this fails quietly and the row opens the job,
          which is the honest answer when the verbs are unknown.
        */
        const sample = held.find((x) => flowIdOf(x) === id);
        /* ⚠️ With no network it cannot answer — the row opens the job, as below, without the failed round trip. */
        if (!sample || knownOffline()) continue;
        const detail = await tasksApi.getById(sample.id).catch(() => null);
        const flow = (detail as unknown as { workflow?: { id?: string } } | null)?.workflow;
        if (flow) next.set(id, flow);
      }
      if (live) setFlows(next);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the SET of workflow ids, not every task change
  }, [offline.records, flowIds, online]);

  // Today on mount, always. Selecting a day is a READ.
  const today = useMemo(() => new Date(todayMs), [todayMs]);
  const week = useMemo(() => weekOf(today), [today]);
  /* Called-off jobs are not work — see `withoutCanceled`. */
  const tasks = useMemo(() => withoutCanceled(held, flows), [held, flows]);

  const open = useCallback((task: Task) => !isClosed(task, stepsFor(task, flows)), [flows]);
  const underWay = useCallback((task: Task) => isUnderWay(task, stepsFor(task, flows)), [flows]);
  const dayTasks = useMemo(() => (shape === 'shifts' ? [] : tasksOn(tasks, selected)), [shape, tasks, selected]);
  const dots = useMemo(() => week.map((d) => (shape === 'shifts' ? 0 : tasksOn(tasks, d).length)), [shape, tasks, week]);

  /*
    ⚠️ MINE ALWAYS LEADS — and on TODAY, mine also carries what is already in
    my hands from earlier days (under way, blocked, overdue), ranked the way
    the Jobs tab ranks it. Other days show their own date only.
  */
  const isToday = sameDay(selected, today);
  const { mine, theirs } = useMemo(() => {
    const own = face === 'executor' ? tasks : tasks.filter((x) => isMine(x, user?.id));
    const mineList = isToday && shape !== 'shifts' ? todaysOwn(own, selected, open, undefined, underWay) : dayTasks.filter((x) => face === 'executor' || isMine(x, user?.id));
    return { mine: mineList, theirs: face === 'executor' ? [] as Task[] : dayTasks.filter((x) => !isMine(x, user?.id)) };
  }, [tasks, dayTasks, face, user?.id, isToday, selected, open, underWay, shape]);

  /*
    ⚠️ TAPPING A ROW MOVES THE FOCUS TO IT (10.png). The active row is the job
    the member is looking at — the first open one of theirs by default, or
    whichever of theirs they tapped. It expands IN PLACE, so the list does not
    reshuffle under their thumb; the sheet opens only from the active row.
  */
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => { setFocusId(null); }, [selected]);
  const active = useMemo(() => {
    if (phase === 'opening') return null;
    const focused = focusId ? mine.find((x) => x.id === focusId && isMine(x, user?.id) && open(x)) : null;
    return focused ?? mine.find((x) => isMine(x, user?.id) && open(x)) ?? null;
  }, [mine, user?.id, open, phase, focusId]);
  /* The step the job is on, in the workflow's own words. */
  const stepLabel = (task: Task) => stepLabelFor(task, flows, t as never);

  /*
    ⚠️ ONE BUTTON: OPEN THE JOB. The widget answers "what is next and where";
    moving the job along lives on the job page, where every workflow's steps,
    check-ins, reports and sign-offs already are. A second copy of that flow
    on the home screen was a second thing to keep right for every workflow.
  */
  const openTask = useCallback((task: Task) => router.push(`/task/${task.id}` as Href), [router]);

  /*
    ⚠️ THE EARLY EXIT IS BELOW EVERY HOOK. Holding neither module means the
    widget does not render — but a return above a hook changes how many hooks
    run between renders the day somebody's modules change.
  */
  const todayOpen = isToday ? mine.filter((x) => isMine(x, user?.id) && open(x)).length : 0;
  usePitch(phase === 'opening' ? null : todayOpen
    ? { need: 0, line: t('pitch.myWork', { count: todayOpen }) }
    : { need: 0, line: t('pitch.myWorkCalm') });

  if (shape === 'none') return null;

  const todayShift = sameDay(selected, today) && shift.status?.isClockedIn ? shift.status.currentEntry : null;
  const selShift = shiftOn(schedule, selected);
  /* ⚠️ What the card SHOWS, carried-over work included — not only the jobs dated that day. */
  const pillCount = shape === 'shifts' ? schedule.filter((e) => e.isActive).length : mine.length + theirs.length;

  return (
    <View style={style}>
      <CardSurface style={{ padding: amazen.space(4.5), gap: amazen.space(3) }}>
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
                accessibilityLabel={weekdayName(d, 'long')}
                style={{
                  flex: 1, height: 54, borderRadius: amazen.radius.full,
                  alignItems: 'center', justifyContent: 'center', gap: 4,
                  /* Every day is a capsule with a hairline ring; the day shown is jade. */
                  backgroundColor: on ? c.accentTint : 'transparent',
                  borderWidth: on ? 1.5 : 1, borderColor: on ? c.accent : c.lineGlass,
                }}
              >
                <AText variant="caption" tone={on ? 'strong' : 'muted'}>{weekdayName(d, 'narrow')}</AText>
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
              {/* ⚠️ The rows the list SHOWS — carried-over work included — not only the jobs dated that day: "1 job" over four rows read as a miscount. */}
              {shape === 'tasks' && pillCount > 0 ? ` · ${t('myWork.jobs', { count: pillCount, defaultValue: `${pillCount} jobs` })}` : ''}
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
                      : t('myWork.nothingOn', { day: weekdayName(selected, 'long'), defaultValue: `Nothing scheduled on ${weekdayName(selected, 'long')}.` })}
                    body={nextJobLine(nextJobAfter(face === 'executor' ? tasks : tasks.filter((x) => isMine(x, user?.id)), selected, open), t, clock)}
                  />
                ) : null}
                {mine.map((task, i) => (
                  <React.Fragment key={task.id}>
                    {i > 0 && task !== active && mine[i - 1] !== active ? <WellDivider /> : null}
                    {task === active ? (
                      <ActiveRow
                        key={`active:${task.id}`}
                        task={task}
                        label={stepLabel(task)}
                        clock={clock}
                        onOpen={() => openTask(task)}
                      />
                    ) : (
                      /*
                        ⚠️ EVERY ROW IN THIS LIST IS THE READER'S. It passed
                        `face !== 'executor'`, so an executor's own jobs were
                        drawn as somebody else's: a hollow ring and their OWN
                        first name in front of every title ("Karim · …").
                      */
                      <PlainRow
                        task={task} done={!open(task)} mine clock={clock}
                        /* Yours and still open: focus it here. Anything else opens the job. */
                        onPress={() => (isMine(task, user?.id) && open(task) ? setFocusId(task.id) : openTask(task))}
                      />
                    )}
                  </React.Fragment>
                ))}

                {face === 'spaceSupervisor' && theirs.length > 0 ? (
                  <>
                    <Eyebrow tone="muted" style={{ marginTop: amazen.space(2) }}>{siteLabel(theirs, t)}</Eyebrow>
                    {theirs.slice(0, 3).map((task) => <PlainRow key={task.id} task={task} done={!open(task)} mine={false} clock={clock} onPress={() => openTask(task)} />)}
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
      </CardSurface>

    </View>
  );
}

/* ---------------- parts ---------------- */


/**
 * The first open job of the day, WHEN IT IS THE READER'S OWN — raised one step
 * out of the well and carrying its decision.
 */
function ActiveRow({ task, label, clock, onOpen }: { task: Task; label: string; clock: (d: string) => string; onOpen: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  /*
    A short fade as focus lands. ⚠️ OPACITY ONLY — a Reanimated LAYOUT
    animation corrupted the home column on Android (mobile-cross-platform-traps).
  */
  const fade = useRef(new RNAnimated.Value(0.35)).current;
  useEffect(() => { RNAnimated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start(); }, [fade]);

  const late = daysLate(task.dueDate ?? null) ?? 0;
  const meta = [
    late > 0
      ? t('myWork.late', { count: late, defaultValue: `${late} days late` })
      : hasHour(task.dueDate) ? clock(task.dueDate!) : null,
    task.locationAddress,
    (task as unknown as { space?: { name?: string } }).space?.name,
  ].filter(Boolean).join(' · ');
  const open = t('myWork.openJob', { defaultValue: 'Open the job' });

  return (
    <RNAnimated.View style={{ opacity: fade, backgroundColor: c.tile, borderRadius: 20, padding: amazen.space(3.5), gap: 4, marginVertical: amazen.space(1) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: late > 0 ? c.warn : c.accent }} />
        <Eyebrow tone={late > 0 ? 'warn' : 'muted'} style={{ flexShrink: 1 }}>{label}</Eyebrow>
        <SyncChip entityId={task.id} />
      </View>
      <AText variant="h3" tone="strong" numberOfLines={2}>{task.title}</AText>
      {meta ? <AText variant="caption" tone="muted" numberOfLines={1}>{meta}</AText> : null}

      {/* ⚠️ The lift sits on a wrapper: `overflow: hidden` on the pill would clip its own shadow on iOS. */}
      <View style={{ marginTop: amazen.space(2.5), borderRadius: amazen.radius.full, backgroundColor: c.accentSolid, shadowColor: c.accentSolid, shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${open}: ${task.title}`}
          style={({ pressed }) => ({ borderRadius: amazen.radius.full, overflow: 'hidden', opacity: pressed ? 0.88 : 1 })}>
          <LinearGradient
            colors={amazen.gradient.primary as unknown as [string, string, ...string[]]}
            style={{ minHeight: amazen.layout.tapMin + 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: amazen.space(4) }}
          >
            <AText variant="body" tone="accentInk" style={{ fontFamily: amazen.type.h3.fontFamily }}>{open}</AText>
          </LinearGradient>
        </Pressable>
      </View>
    </RNAnimated.View>
  );
}


function PlainRow({ task, done, mine, clock, onPress }: { task: Task; done: boolean; mine: boolean; clock: (d: string) => string; onPress: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
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
        {done
          ? t('myWork.done', { defaultValue: 'done' })
          : (daysLate(task.dueDate ?? null) ?? 0) > 0
            ? t('myWork.late', { count: daysLate(task.dueDate ?? null), defaultValue: 'late' })
            : hasHour(task.dueDate) ? clock(task.dueDate!) : ''}
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
            {t('myWork.noShift', { day: weekdayName(selected, 'long'), defaultValue: `No shift on ${weekdayName(selected, 'long')}.` })}
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
              <AText variant="body" tone="strong" style={{ flex: 1 }}>{weekdayName(d, 'long')}</AText>
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

type T = (k: string, o?: Record<string, unknown>) => string;

function dayEyebrow(d: Date, today: Date, t: T): string {
  if (sameDay(d, today)) return t('common.today', { defaultValue: 'Today' });
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, tomorrow)) return t('common.tomorrow', { defaultValue: 'Tomorrow' });
  return weekdayName(d, 'long');
}

/** `clock` is the member's own 12/24h time — `toTimeString` ignored it. */
function nextJobLine(next: Task | null, t: T, clock: (d: Date) => string): string {
  if (!next?.dueDate) return t('myWork.nothingAhead', { defaultValue: 'Nothing else is scheduled yet.' });
  const d = new Date(next.dueDate);
  const day = weekdayName(d, 'long');
  return hasHour(next.dueDate)
    ? t('myWork.nextAt', { day, time: clock(d), defaultValue: `Your next job is ${day} at ${clock(d)}.` })
    : t('myWork.nextOn', { day, defaultValue: `Your next job is ${day}.` });
}

function siteLabel(theirs: Task[], t: T): string {
  const names = new Set(theirs.map((x) => (x as unknown as { space?: { name?: string } }).space?.name).filter(Boolean));
  const name = names.size === 1 ? [...names][0]! : t('myWork.yourSites', { defaultValue: 'Your sites' });
  return `${name} · ${theirs.length}`;
}
