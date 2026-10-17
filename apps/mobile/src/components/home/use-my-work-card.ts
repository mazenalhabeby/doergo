import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAppStateChange } from '../../lib/app-resume';
import { type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { hasAccessModule } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useHomeTasks } from '../../offline/tasks/use-home-tasks';
import { useOffline } from '../../offline/offline-context';
import { isUnreachable } from '../../offline/actions/unreachable';
import { useShift } from '../../offline/attendance/use-shift';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { scheduleApi } from '../../lib/api';
import type { ScheduleEntry, Task } from '../../lib/api/types';
import { usePitch } from '../../home/pitch';
import {
  shapeFor,
  faceFor,
  viewAllSpaceIds,
  weekOf,
  sameDay,
  startOfDay,
  tasksOn,
  isMine,
  stepsFor,
  isClosed,
  isUnderWay,
  todaysOwn,
  msUntilNextDay,
  withoutCanceled,
  stepLabelFor,
} from './my-work';
import { useTaskFlows } from './use-task-flows';

/** MyWorkCard's state and handlers — everything before its markup, moved here unchanged. */
export function useMyWorkCard({ style }: Pick<{ style?: StyleProp<ViewStyle> }, 'style'>) {
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
    const off = onAppStateChange((st) => { if (st === 'active') syncDay(); });
    return () => { clearTimeout(timer); off(); };
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
    The workflows the rows run on — `useTaskFlows`, the same lookup the Jobs
    tab reads, so a job's step and verb are the same words in both places.
  */
  const flows = useTaskFlows(held);

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
    const mineList =
      isToday && shape !== 'shifts'
        ? todaysOwn(own, selected, open, undefined, underWay)
        : dayTasks.filter((x) => face === 'executor' || isMine(x, user?.id));
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

  return {
    user,
    amazen,
    t,
    clock,
    router,
    shift,
    c,
    updatedAt,
    shape,
    face,
    phase,
    setPhase,
    fetchList,
    selected,
    setSelected,
    schedule,
    today,
    week,
    tasks,
    open,
    dots,
    mine,
    theirs,
    setFocusId,
    active,
    stepLabel,
    openTask,
  };
}
