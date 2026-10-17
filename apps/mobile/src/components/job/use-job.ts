import { useCallback, useEffect, useRef, useState } from 'react';
import { onAppStateChange } from '../../lib/app-resume';
import { getFix } from '../../lib/location-fix';
import { useTranslation } from 'react-i18next';
import { needsTravelEstimate, slotHeldBy } from '@hbcfield/shared/client';
import {
  tasksApi,
  reportsApi,
  TaskStatus,
  type Comment,
  type ServiceReport,
  type StepSubmission,
  type Task,
  type TaskEvent,
} from '../../lib/api';
import { useAuth } from '../../contexts/auth-context';
import { useSocketContext } from '../../contexts/socket-context';
import { useRefreshJobTime } from '../../hooks/useJobTime';
import { SocketEvents } from '../../lib/socket';
import { useLocationTrackingContext } from '../../contexts/location-tracking-context';
import { hasArrivalPrompt } from '../../services/route-arrival';
import { useOffline } from '../../offline/offline-context';
import { knownOffline } from '../../offline/connectivity';
import { loadTaskDetail, type DetailAttachment, type DetailTask } from '../../offline/tasks/task-source';
import { overlayTask } from '../../offline/tasks/overlay';
import { taskDestination } from '../../offline/tasks/status-fix';
import { caught } from '../../lib/caught';

/** The task as the page holds it: the server's copy, or the phone's with unsent changes on top. */
/** A task event on the socket: the task itself, or `{ task }` (id-only on task_updated). */
type TaskLiveEvent = { id?: string; task?: { id?: string } | null } | null;

export type JobTask = DetailTask;
export type JobComment = Comment & { pendingSync?: boolean };

/** A step taken on THIS phone this session — shown in the feed before the server's timeline has it. */
export interface LocalEvent {
  id: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  pendingSync?: boolean;
}


/**
 * Everything the job page READS, and keeps fresh.
 *
 * ⚠️ ONE LOADER — `loadTaskDetail` — for the first open and for Retry: from
 * the server when it answers, from the phone's saved copy when it does not,
 * with the member's unsent changes on top either way.
 *
 * ⚠️ THE TIMELINE IS NOT ASKED FOR ON OPEN. It is one more request, and most
 * opens never scroll to the activity feed. It is fetched once, when the feed
 * comes on screen (`loadEvents`) — or at once for a BLOCKED job, whose banner
 * needs the reason that is only stored on the status event.
 */
export function useJob(taskId: string) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const offline = useOffline();

  const [task, setTask] = useState<JobTask | null>(null);
  const [comments, setComments] = useState<JobComment[]>([]);
  const [attachments, setAttachments] = useState<DetailAttachment[]>([]);
  const [source, setSource] = useState<'server' | 'phone'>('server');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetching = useRef(false);
  const lastFetched = useRef<string | null>(null);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    if (!taskId) return;
    try {
      fetching.current = true;
      setLoading(true);
      setError(null);
      const detail = await loadTaskDetail(taskId, {
        records: offline.records,
        operations: offline.engine?.operations() ?? [],
        me: { id: user?.id ?? '', firstName: user?.firstName, lastName: user?.lastName },
        fileUri: offline.files ? (fileId, mime) => offline.files!.uriFor(fileId, mime) : undefined,
        cachedMediaUri: offline.media ? (attId) => offline.media!.uriFor(attId) : undefined,
      });
      if (signal.cancelled) return;
      setTask(detail.task as JobTask);
      setComments(detail.comments);
      setAttachments(detail.attachments);
      setSource(detail.source);
      lastFetched.current = taskId;
    } catch (err: unknown) {
      if (signal.cancelled) return;
      if (caught(err).statusCode === 401 || caught(err).message?.includes('Session expired')) return;
      setError(err instanceof Error ? err.message : t('taskDetail.failedToLoad'));
    } finally {
      if (!signal.cancelled) setLoading(false);
      fetching.current = false;
    }
  }, [taskId, offline.records, offline.engine, offline.files, offline.media, user?.id, user?.firstName, user?.lastName, t]);

  useEffect(() => {
    if (!taskId || fetching.current || lastFetched.current === taskId) return;
    const signal = { cancelled: false };
    void load(signal);
    return () => { signal.cancelled = true; };
  }, [taskId, load]);

  const retry = useCallback(() => {
    lastFetched.current = null;
    fetching.current = false;
    void load({ cancelled: false });
  }, [load]);

  /* ---------------- live updates ---------------- */

  const { isConnected, subscribe } = useSocketContext();
  const refreshJobTime = useRefreshJobTime();
  useEffect(() => {
    if (!isConnected || !taskId) return;
    /*
      ⚠️ THE TIME AND THE CREW TOO. A crew change (somebody joined, left,
      stopped, the lead moved) is announced as task.updated — reloading only
      the task left the crew card saying "3 of 3 on the job" after Conor had
      gone, until this phone's OWN next tap.
    */
    const refreshTask = () => {
      tasksApi.getById(taskId).then((next) => setTask(next as JobTask)).catch(() => undefined);
      refreshJobTime(taskId);
    };
    const refreshComments = () => {
      tasksApi.getComments(taskId).then(setComments).catch(() => undefined);
    };
    /*
      ⚠️ THE SERVER SENDS THE TASK ITSELF for updated/assigned (websocket.gateway
      emitTaskUpdated(task)), and `{ task, … }` for a status change. Reading only
      `d.task.id` matched nothing on an update, so this page never redrew for
      anybody else's change — a checklist item somebody took, a renamed item.
    */
    const isThisJob = (d: TaskLiveEvent) => (d?.task?.id ?? d?.id) === taskId;
    const unsubs = [
      subscribe(SocketEvents.TASK_STATUS_CHANGED, (d: TaskLiveEvent) => { if (isThisJob(d)) refreshTask(); }),
      subscribe(SocketEvents.TASK_UPDATED, (d: TaskLiveEvent) => { if (isThisJob(d)) refreshTask(); }),
      subscribe(SocketEvents.TASK_ASSIGNED, (d: TaskLiveEvent) => { if (isThisJob(d)) refreshTask(); }),
      subscribe(SocketEvents.TASK_COMMENT_ADDED, (d: { taskId?: string } | null) => { if (d?.taskId === taskId) refreshComments(); }),
    ];
    return () => unsubs.forEach((fn) => fn());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, subscribe, taskId]);

  /* ---------------- arrival ---------------- */

  /*
    Has the phone noticed the member reach the site? The background tracker
    sets this from points it already records (route-arrival.ts). It is a flag a
    background task writes, so there is nothing to subscribe to — read every
    half-minute while this screen is open on a live route, and on resume.
  */
  const [hasArrived, setHasArrived] = useState(false);
  useEffect(() => {
    if (!task?.id || task.status !== TaskStatus.EN_ROUTE) { setHasArrived(false); return; }
    let active = true;
    const check = () => { hasArrivalPrompt(task.id).then((v) => { if (active) setHasArrived(v); }); };
    check();
    const timer = setInterval(check, 30000);
    const off = onAppStateChange((next) => { if (next === 'active') check(); });
    return () => { active = false; clearInterval(timer); off(); };
  }, [task?.id, task?.status]);

  /* ---------------- where the phone is, for "leave by" ---------------- */

  /*
    ⚠️ NEVER PROMPTS. `getForegroundPermissionsAsync` asks what was already
    granted: a permission dialog in front of somebody who only opened a job to
    read it, for a line that is a convenience, would be a worse screen. Read
    once — the member is standing still reading their phone.
  */
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!task || !needsTravelEstimate(task)) return;
    let alive = true;
    (async () => {
      try {
        const loc = await getFix({ purpose: 'nearby' });
        if (alive) setHere({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        // No position, no estimate.
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task?.dueDate, task?.locationLat, task?.locationLng]);

  /* ---------------- the route follows the step ---------------- */

  // Tracking lives in the app-level context, so it survives leaving this screen.
  const tracking = useLocationTrackingContext();
  const { isTracking, startTracking, stopTracking } = tracking;
  useEffect(() => {
    if (task?.status === TaskStatus.EN_ROUTE && !isTracking && task.id) {
      void startTracking(task.id, taskDestination(task));
    } else if (task && task.status !== TaskStatus.EN_ROUTE && isTracking) {
      stopTracking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.status, task?.id, isTracking, startTracking, stopTracking]);

  /* ---------------- the timeline, on demand ---------------- */

  const [events, setEvents] = useState<TaskEvent[] | null>(null);
  const eventsAsked = useRef(false);
  const loadEvents = useCallback(() => {
    // Kept by the response cache (response-cache.ts), so with no signal the last answer still reads.
    if (!taskId || eventsAsked.current) return;
    eventsAsked.current = true;
    tasksApi.getTimeline(taskId)
      .then((rows) => setEvents(Array.isArray(rows) ? rows : []))
      .catch(() => undefined); // The feed keeps what the page already holds.
  }, [taskId]);
  // A blocked job's banner needs the reason, which lives only on the status event.
  useEffect(() => {
    if (task?.status === TaskStatus.BLOCKED && !loading) loadEvents();
  }, [task?.status, loading, loadEvents]);

  const [localEvents, setLocalEvents] = useState<LocalEvent[]>([]);
  const pushLocalEvent = useCallback((e: Omit<LocalEvent, 'id' | 'createdAt'>) => {
    setLocalEvents((prev) => [...prev, { ...e, id: `local:${Date.now()}:${prev.length}`, createdAt: new Date().toISOString() }]);
  }, []);

  /* ---------------- the finished report, on demand ---------------- */

  /** `undefined` = not asked yet; `null` = the job closed without one; 'unreachable' = nothing answered and nothing kept. */
  const [report, setReport] = useState<ServiceReport | null | undefined | 'unreachable'>(undefined);
  const reportAsked = useRef(false);
  const loadReport = useCallback(() => {
    if (!taskId || reportAsked.current) return;
    reportAsked.current = true;
    reportsApi.getByTask(taskId)
      .then(setReport)
      // Nothing answered and nothing kept — said, not retried on every scroll; reopening the job asks again.
      .catch(() => setReport(knownOffline() ? 'unreachable' : null));
  }, [taskId]);

  /* ---------------- the step forms it was moved with, on demand ---------------- */

  /**
   * `GET /tasks/:id/submissions` — the job's reports. Asked for only when the
   * Reports section comes on screen, like the service report above.
   * `undefined` = not asked yet; 'unreachable' = nothing answered and nothing kept.
   */
  const [submissions, setSubmissions] = useState<StepSubmission[] | undefined | 'unreachable'>(undefined);
  const submissionsAsked = useRef(false);
  const loadSubmissions = useCallback(() => {
    if (!taskId || submissionsAsked.current) return;
    submissionsAsked.current = true;
    tasksApi.getSubmissions(taskId)
      .then(setSubmissions)
      .catch(() => setSubmissions(knownOffline() ? 'unreachable' : []));
  }, [taskId]);
  /** A move with a form went through on this phone: read them again — but only if they were ever read. */
  const reloadSubmissions = useCallback(() => {
    if (!submissionsAsked.current) return;
    submissionsAsked.current = false;
    loadSubmissions();
  }, [loadSubmissions]);

  /*
    ⭐ ONE JOB AT A TIME, KNOWN BEFORE THE TAP. The server refuses accepting a
    job while another of the member's holds the slot; the page reads the
    phone's own copy of their jobs (no request) and names the one in the way.
    With no copy on the phone (offline mode off) it is unknown, and a refusal
    is shown in the dock instead.
  */
  const [slotHolder, setSlotHolder] = useState<Task | null>(null);
  useEffect(() => {
    const records = offline.records;
    if (!records || !task?.id) { setSlotHolder(null); return; }
    let live = true;
    const ops = offline.engine?.operations() ?? [];
    records.list<Task>('tasks')
      .then((rows) => { if (live) setSlotHolder(slotHeldBy(task.id, user?.id, rows.map((r) => overlayTask(r.data, ops) as Task))); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [offline.records, offline.engine, task?.id, task?.status, user?.id]);

  return {
    slotHolder,
    task, setTask, comments, setComments, attachments, setAttachments,
    source, loading, error, retry, reload: () => load({ cancelled: false }),
    hasArrived, here, tracking,
    events, loadEvents, localEvents, pushLocalEvent,
    report, loadReport,
    submissions, loadSubmissions, reloadSubmissions,
  };
}

export type JobState = ReturnType<typeof useJob>;
