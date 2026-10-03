import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, View,
  type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { daysLate, getFlowSteps, hasAccessModule, hasCapability, hasFeatureModule, isJobPaused, spaceRunsClock, stepStartsWork, type TaskCapability } from '@hbcfield/shared/client';
import { TaskStatus } from '../../lib/api';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { useImagePicker } from '../../hooks/useImagePicker';
import { useResponsive } from '../../lib/responsive';
import { oversees, holds } from '../../lib/permissions';
import { getJobId } from '../../lib/utils';
import { useConnectivity } from '../../offline/offline-context';
import { OfflineBanner } from '../../offline/components/offline-banner';
import { taskDestination } from '../../offline/tasks/status-fix';
import { Ground, AText } from '../amazen';
import { centeredContent } from '../screen-container';
import { flowIdOf, hasHour, stepLabelFor } from '../home/my-work';
import { useJob } from './use-job';
import { useJobWrites, type WriteStatus } from './use-job-writes';
import {
  capsAt, checklistMode, checklistStep, decideNext, dockMode, heldUntilDue, isCanceledStatus, isClosedStatus,
  formSheetTarget, moreOptions, needsReport, stepPosition, formatOnJob, type MoreOption, type OpenSheet,
} from './job-logic';
import { formForMove, moveKind, workflowAsks } from './step-form-logic';
import { glyphFor } from './step-glyph';
import { openJobInMaps } from './maps';
import { JobHeader, JobTopRow } from './job-header';
import { JobBanners } from './job-banners';
import { JobFacts, JobMap } from './job-facts';
import { JobChecklist } from './job-checklist';
import { JobFields } from './job-fields';
import { JobFiles, type JobFile } from './job-files';
import { JobActivity } from './job-activity';
import { JobReport } from './job-report';
import { JobSubmissions } from './job-submissions';
import { JobDock, type DockPrimary } from './job-dock';
import { Banner, QuietButton, SectionLabel } from './job-ui';
import { MoreSheet } from './sheets/more-sheet';
import { ReportIssueSheet } from './sheets/report-issue-sheet';
import { JobConfirmSheet } from './sheets/confirm-sheet';
import { ClockInToStartSheet } from './sheets/clock-in-to-start-sheet';
import { HandoverSheet } from './sheets/handover-sheet';
import { JobHandover } from './job-handover';
import { JobTimeCard } from './job-time-card';
import { HandOverLeadSheet, JobCrewCard, MyIssueSheet } from './job-crew';
import { useCrew } from './use-crew';
import { jobTimeNow } from './job-time-logic';
import { useJobTime } from '../../hooks/useJobTime';
import { LocationPickerSheet } from '../index';
import { useShift } from '../../offline/attendance/use-shift';
import { useClockIn } from '../../hooks/useClockIn';
import { AssignSheet } from './sheets/assign-sheet';
import { EditSheet } from './sheets/edit-sheet';
import { StepFormSheet } from './sheets/step-form-sheet';
import { SignSheet } from './sheets/sign-sheet';
import { TourTarget, useTourScroll } from '../tour/tour-target';

type SheetKind = 'more' | 'issue' | 'decline' | 'cancel' | 'assign' | 'edit' | 'form' | 'sign' | 'delete' | 'clockIn' | 'handover' | 'myIssue' | 'handOverLead';

/** What waits for the clock-in: a step to move into, or picking a paused job back up. */
const RESUME = '__resume__';

/** A link's sheet as the page's own: `finish` and `form:<STEP>` are both the step form. */
function sheetOf(open: OpenSheet | null): SheetKind | null {
  if (!open || open === 'join') return null;
  if (open === 'finish' || formSheetTarget(open)) return 'form';
  return open as Exclude<OpenSheet, 'finish' | 'join' | `form:${string}`>;
}

const ACTIVE: string[] = [TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED];

/**
 * THE JOB — `docs/design/job-flow.html`, `renderDetail()`.
 *
 * Top to bottom: where the job is in its own workflow, what is in the way
 * (leave by, you're there, blocked), the facts and the map, the details, the
 * checklist, its fields, photos, and one activity feed. At the bottom ONE
 * button — the next step of the job's workflow — with Navigate while it is
 * travel and ⋯ for everything else. Every popup is the one sheet.
 *
 * Rendered as the `/task/[id]` route (a slide-up panel over a blur) or
 * `embedded` in the Jobs tab's split view (a plain pane).
 */
export function JobPage({
  taskId,
  embedded = false,
  onClose,
  writeStatus,
  initialSheet = null,
}: {
  taskId: string;
  embedded?: boolean;
  onClose?: () => void;
  writeStatus: WriteStatus;
  /**
   * A sheet to open as the page arrives — the Jobs tab's Next up card hands
   * over here for the steps that need the page (Finish, Report an issue,
   * Decline…) rather than keeping a second copy of them.
   */
  initialSheet?: OpenSheet | null;
}) {
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const tourScroll = useTourScroll();
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatDueDate, formatTime, formatDateFull } = useTimeFormat();
  const keyboard = useKeyboardHeight();
  const connectivity = useConnectivity();
  const { takePhoto, pickFromGallery } = useImagePicker();
  const job = useJob(taskId);
  // Job time — read here, before any early return (rules of hooks).
  const jobTime = useJobTime(taskId);
  // A crew on this job (shared tasks/crew.ts) — rides on the job's time read.
  const crew = useCrew(taskId, jobTime.view?.crew, user?.id);
  /*
    "I'm with him" on the crew push: the job opens and joins, from the leader's
    start (the server allows it within 30 minutes). Asked once, when the crew
    is known — joined already, or not on this crew, it does nothing.
  */
  const joinAsked = useRef(false);
  useEffect(() => {
    if (initialSheet !== 'join' || joinAsked.current || !crew.view || !crew.me) return;
    joinAsked.current = true;
    if (!crew.me.joined) void crew.join(true);
  }, [initialSheet, crew]);
  const { task } = job;

  /* ---------------- the panel ---------------- */

  const SCREEN_H = r.height;
  const slide = useRef(new Animated.Value(SCREEN_H)).current;
  const overlay = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (embedded) return;
    Animated.parallel([
      Animated.timing(overlay, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = useCallback(() => {
    if (embedded) { onClose?.(); return; }
    Animated.parallel([
      Animated.timing(overlay, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slide, { toValue: SCREEN_H, duration: 250, useNativeDriver: true }),
    ]).start(() => router.back());
  }, [embedded, onClose, overlay, slide, SCREEN_H]);

  /* ---------------- the workflow's words ---------------- */

  const flowId = task ? flowIdOf(task) : null;
  const flows = useMemo(() => new Map<string, unknown>(flowId && task?.workflow ? [[flowId, task.workflow]] : []), [flowId, task?.workflow]);
  const labelOf = useCallback(
    (key: string) => (task ? stepLabelFor({ ...task, status: key as never }, flows, t as never) : key),
    [task, flows, t],
  );

  const writes = useJobWrites(job, { writeStatus, onClosed: close, labelOf });
  const [sheet, setSheet] = useState<SheetKind | null>(sheetOf(initialSheet));
  /*
    The step the form sheet moves the job to — null = the dock's own next step
    (an older `?sheet=finish` link). Field errors from a refused move keep the
    sheet open on the fields they name.
  */
  const [formTo, setFormTo] = useState<string | null>(formSheetTarget(initialSheet));
  const [formErrors, setFormErrors] = useState<Record<string, string> | null>(null);
  const [deleting, setDeleting] = useState<JobFile | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  /*
    Clocked in to start work (shared clock-gate.ts). The step waits here while
    the member clocks in; the clock-in's own success moves the job on, so one
    tap does both and nothing is lost if they close the sheet.
  */
  const shift = useShift();
  const [startAfterClockIn, setStartAfterClockIn] = useState<string | null>(null);
  const clockIn = useClockIn({
    assignedLocations: shift.status?.assignedLocations ?? [],
    isClockedIn: !!shift.status?.isClockedIn,
    onClockedIn: () => {
      void shift.refresh();
      const to = startAfterClockIn;
      setStartAfterClockIn(null);
      setSheet(null);
      if (to === RESUME) void writes.resume();
      else if (to) void writes.changeStatus(to);
    },
  });

  /* ---------------- what is on screen ---------------- */

  /*
    ⚠️ The timeline and the finished report are asked for when their section
    first comes into view, not on open. Positions are read from `onLayout`;
    the bottom edge of what is visible from the scroll.
  */
  const seenTo = useRef(0);
  const activityY = useRef<number | null>(null);
  const reportY = useRef<number | null>(null);
  const submissionsY = useRef<number | null>(null);
  const closedRef = useRef(false);
  const asksRef = useRef(false);
  const check = useCallback(() => {
    if (activityY.current != null && seenTo.current >= activityY.current) job.loadEvents();
    if (closedRef.current && reportY.current != null && seenTo.current >= reportY.current) job.loadReport();
    if (asksRef.current && submissionsY.current != null && seenTo.current >= submissionsY.current) job.loadSubmissions();
  }, [job]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = e.nativeEvent;
    seenTo.current = Math.max(seenTo.current, contentOffset.y + layoutMeasurement.height);
    check();
  };
  const onViewport = (e: LayoutChangeEvent) => {
    seenTo.current = Math.max(seenTo.current, e.nativeEvent.layout.height);
    check();
  };
  const at = (ref: React.MutableRefObject<number | null>) => (e: LayoutChangeEvent) => {
    ref.current = e.nativeEvent.layout.y + 40;
    check();
  };

  /* ---------------- shell ---------------- */

  const shell = (children: React.ReactNode) => {
    const panel = (
      <Ground style={{ flex: 1 }}>
        {!embedded ? <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: c.inkMuted, opacity: 0.4, marginTop: amazen.space(2) }} /> : null}
        {children}
      </Ground>
    );
    if (embedded) return <View style={{ flex: 1 }}>{panel}</View>;
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Stack.Screen options={{ headerShown: false }} />
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlay }]}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t('common.close')} />
          </BlurView>
        </Animated.View>
        <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '94%', borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', transform: [{ translateY: slide }] }}>
          {panel}
        </Animated.View>
      </View>
    );
  };

  if (job.loading && !task) {
    return shell(
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </View>,
    );
  }

  if (job.error || !task) {
    return shell(
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: amazen.space(6), gap: amazen.space(3) }}>
        <AText variant="h3" tone="strong" style={{ textAlign: 'center' }}>{job.error || t('taskDetail.taskNotFound')}</AText>
        <View style={{ alignSelf: 'stretch', gap: amazen.space(2) }}>
          <QuietButton tone="accent" label={t('common.retry')} onPress={job.retry} />
          <QuietButton label={t('taskDetail.goBack')} onPress={close} />
        </View>
      </View>,
    );
  }

  /* ---------------- decisions ---------------- */

  const steps = getFlowSteps(task.workflow);
  const workflowName: string | null = task.workflow?.name ?? null;
  const caps = task.capabilities as TaskCapability[] | undefined;
  const oversee = oversees(user);
  const isMine = !!user?.id && task.assignedToId === user.id;
  const doingTheWork = !oversee || isMine;
  const closed = isClosedStatus(task.status, steps);
  closedRef.current = closed;
  const canceled = isCanceledStatus(task.status, steps);
  const mode = dockMode({ closed, oversees: oversee, isMine });
  const decision = decideNext(task.status, steps);
  const position = stepPosition(task.status, steps);
  const lateDays = closed ? 0 : Math.max(0, daysLate(task.dueDate ?? null) ?? 0);
  const hasPlace = task.locationLat != null && task.locationLng != null;
  const canAssign = holds(user, 'canAssignTasks');
  const canEdit = holds(user, 'canCreateTasks');
  const options = moreOptions({ mode, decision, isMine, status: task.status, hasPlace, oversees: oversee, canAssign, canEdit })
    // Crew mode: the leader moves the step and reports a job issue; a member has "My issue" on the crew card.
    .filter((o) => !(crew.stepsAreLeaders && (o.kind === 'step' || o.kind === 'issue')));
  const blocked = task.status === TaskStatus.BLOCKED;

  const openMaps = () => openJobInMaps(task, 'show');
  const navigate = () => openJobInMaps(task, 'navigate');

  /**
   * Take the job to a step: a step whose form asks something opens the step
   * form (the old field-service report included — it is the preset a legacy
   * report step asks), Blocked asks what is wrong (unless it has a form of its
   * own), anything else just goes.
   */
  /**
   * Would this move start work while the member is off the clock? Asked only
   * where a clock exists: their own access has one and the workspace runs Time
   * Tracking. Where the phone cannot tell (a workspace whose modules it was not
   * sent), the server still decides — its refusal is translated like any other.
   */
  const mustClockInFirst = (to: string): boolean =>
    doingTheWork
    && !shift.status?.isClockedIn
    && hasAccessModule(user ?? {}, 'clock')
    && !!task.space?.enabledModules && spaceRunsClock(task.space.enabledModules, null)
    && stepStartsWork(to, capsAt(to, steps, workflowName));

  /*
    Paused at a clock-out (shared tasks/handover.ts): the job is in a working step
    with nobody on it. Picking it up is a move into work — same clock gate — and
    whoever has it now may: the one who stopped, or whoever it was given to.
  */
  const paused = !closed && isJobPaused(task);
  const resume = () => {
    if (mustClockInFirst(task.status)) { setStartAfterClockIn(RESUME); setSheet('clockIn'); return; }
    void writes.resume();
  };

  const go = (to: string) => {
    if (mustClockInFirst(to)) { setStartAfterClockIn(to); setSheet('clockIn'); return; }
    const kind = moveKind(to, formForMove(task.workflow, steps, to, workflowName));
    if (kind === 'issue') { setSheet('issue'); return; }
    if (kind === 'form') {
      writes.resetFormFiles();
      setFormErrors(null);
      setFormTo(to);
      setSheet('form');
      return;
    }
    setSheet(null);
    void writes.changeStatus(to);
  };

  const pick = (o: MoreOption) => {
    switch (o.kind) {
      case 'step': go(o.to); return;
      case 'issue': go(TaskStatus.BLOCKED); return;
      case 'decline': setSheet('decline'); return;
      case 'maps': setSheet(null); openMaps(); return;
      case 'assign': setSheet('assign'); return;
      case 'edit': setSheet('edit'); return;
      case 'cancel': setSheet('cancel'); return;
    }
  };

  /* ---------------- the dock ---------------- */

  const target = decision.primary;
  const held = heldUntilDue(target, task.dueDate);
  /* One job at a time: accepting this one is refused while another holds the slot. */
  const slotHolder = mode === 'doer' && target === TaskStatus.ACCEPTED ? job.slotHolder : null;
  let primary: DockPrimary | null = null;
  if (mode === 'doer' && paused) {
    primary = {
      label: task.pausedById && task.pausedById !== user?.id ? t('job.handover.startWork') : t('job.handover.resume'),
      onPress: resume,
      disabled: writes.busy,
      loading: writes.busy && sheet === null,
    };
  } else if (mode === 'doer' && target && crew.stepsAreLeaders) {
    // Crew mode: the leader moves this job's step — this phone offers the crew controls instead.
    primary = null;
  } else if (mode === 'doer' && target) {
    primary = {
      label: held ? t('taskDetail.statusActions.notYetAvailable') : decision.resume ? t('job.dock.backToWork') : labelOf(target),
      Glyph: glyphFor(target, steps, workflowName),
      onPress: () => go(target),
      disabled: held || !!slotHolder || writes.busy,
      loading: writes.busy && sheet === null,
    };
  } else if (mode === 'overseer' && canAssign) {
    primary = { label: task.assignedToId ? t('job.dock.reassign') : t('job.dock.assign'), onPress: () => setSheet('assign'), disabled: writes.busy };
  }
  const travelling = task.status === TaskStatus.ACCEPTED || task.status === TaskStatus.EN_ROUTE;
  /*
    Job time (shared tasks/job-time.ts): working, travel and blocked apart, only
    inside a shift. A worker reads their OWN share; the office reads the job's.
    The dock's figure is the working time — not "since accepted", which counted
    the evening before and every night after.
  */
  const timeNow = jobTimeNow(jobTime.view, doingTheWork ? user?.id : null, jobTime.now);
  const showTimer = doingTheWork && !closed && hasCapability(caps, 'timer') && ACTIVE.includes(task.status) && (timeNow?.working ?? 0) + (timeNow?.travel ?? 0) > 0;
  const tracksRoute = doingTheWork && task.status === TaskStatus.EN_ROUTE;
  const { isTracking, error: trackingError, startTracking } = job.tracking;
  const timer = paused && doingTheWork ? { text: t('job.timer.paused'), live: false } : showTimer || tracksRoute ? {
    text: showTimer && tracksRoute
      ? t(isTracking ? 'job.timer.onJobTracking' : 'job.timer.onJobNotTracking', { time: formatOnJob((timeNow?.working ?? 0) * 60) })
      : showTimer
        ? t('job.timer.onJob', { time: formatOnJob((timeNow?.working ?? 0) * 60) })
        : isTracking ? t('job.timer.tracking') : t('job.timer.notTracking'),
    // The dot pulses only while the figure beside it is running — a crew member on their own stop has a still working figure.
    live: tracksRoute ? isTracking : timeNow?.live === 'working',
    retry: tracksRoute && trackingError ? () => void startTracking(task.id, taskDestination(task)) : undefined,
  } : null;
  const closedText = !closed ? null : canceled ? t('job.done.canceled') : needsReport(task.status, steps, workflowName) || task.status === TaskStatus.COMPLETED ? t('job.done.completed') : t('job.done.closed');

  /* ---------------- what the page says ---------------- */

  const stepLabel = blocked && !steps.some((s) => s.key === TaskStatus.BLOCKED) ? t('status.BLOCKED') : labelOf(task.status);
  const nextLabel = position.next ? labelOf(position.next.key) : null;
  const who = task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`.trim() : '';
  const facts = [
    { label: t('job.facts.when'), value: task.dueDate ? `${formatDueDate(task.dueDate)}${hasHour(task.dueDate) ? ` ${formatTime(task.dueDate, null)}` : ''}` : '' },
    { label: t('job.facts.where'), value: task.locationAddress ?? '' },
    { label: t('job.facts.workspace'), value: task.space?.name ?? '' },
    who
      ? { label: t('job.facts.who'), value: isMine ? `${who} ${t('job.facts.you')}` : who }
      : { label: t('job.facts.who'), value: t('job.facts.nobody'), tone: 'warn' as const },
    { label: t('job.facts.from'), value: task.createdBy ? `${task.createdBy.firstName} ${task.createdBy.lastName}`.trim() : '' },
  ];

  // The reason the job is blocked: said on this phone, or on the status event.
  const blockedReason: string | null | undefined = !blocked ? undefined : (() => {
    const mine = [...job.localEvents].reverse().find((e) => e.metadata.newStatus === TaskStatus.BLOCKED);
    if (mine?.metadata.reason) return String(mine.metadata.reason);
    const ev = (job.events ?? []).filter((e) => e.eventType === 'STATUS_CHANGED' && e.metadata?.newStatus === TaskStatus.BLOCKED)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    return ev?.metadata?.reason ? String(ev.metadata.reason) : null;
  })();
  const arrivalStep = [decision.primary, ...decision.rest].find((k) => k === TaskStatus.ARRIVED) ?? null;
  const futureLine = held && task.dueDate
    ? `${t('taskDetail.futureTask.scheduledFor', { date: formatDateFull(task.dueDate) })} ${t('taskDetail.futureTask.canStartOnDueDate')}`
    : null;

  const opensAt = checklistStep(steps, workflowName);
  const checkMode = checklistMode({
    doer: doingTheWork && !closed,
    stepHasChecklist: hasCapability(caps, 'checklist'),
    // The workspace's module list is judged on the server (`@RequireModule('checklists')`);
    // a refusal rolls the tick back and says so.
    moduleOn: true,
    offline: connectivity === 'offline',
  });
  const stepSignature = doingTheWork && !closed && hasCapability(caps, 'signature');
  const reportShown = closed && !canceled;

  /* The step form being answered — the step it moves to, and what that step asks. */
  const formTarget = formTo ?? decision.primary;
  const activeForm = formTarget ? formForMove(task.workflow, steps, formTarget, workflowName).form : null;
  /*
    Reports: asked for only when the workflow asks something somewhere and the
    job has moved past its first step — then read when the section is seen.
  */
  const asks = workflowAsks(task.workflow, steps, workflowName);
  const submissionsShown = asks && (position.index !== 0 || closed || blocked);
  asksRef.current = submissionsShown;
  const submissionList = Array.isArray(job.submissions) ? job.submissions : null;
  // An older job's service report says "none" only where no step form could have stood in for it.
  const reportSaysNone = !asks || (submissionList !== null && submissionList.length === 0);

  const bottom = embedded ? 0 : insets.bottom;
  const iosKeyboard = Platform.OS === 'ios' ? keyboard : 0;

  return shell(
    <View style={{ flex: 1, paddingBottom: iosKeyboard }}>
      <JobTopRow taskId={task.id} jobId={getJobId(task.id)} pendingSync={task.pendingSync} fromPhone={job.source === 'phone'} onClose={close} />
      <ScrollView
        ref={tourScroll.ref}
        style={{ flex: 1 }}
        onLayout={onViewport}
        onScroll={(e) => { onScroll(e); tourScroll.onScroll(e); }}
        scrollEventThrottle={200}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          { paddingHorizontal: amazen.space(4), paddingTop: amazen.space(1), paddingBottom: amazen.space(6), gap: amazen.space(3.5) },
          r.isTablet ? centeredContent(720) : null,
        ]}
      >
        <OfflineBanner />
        <JobHeader
          stepLabel={stepLabel}
          blocked={blocked}
          closed={closed}
          lateDays={lateDays}
          priority={task.priority}
          title={task.title}
          position={position}
          nextLabel={nextLabel}
        />

        <JobBanners
          doer={doingTheWork && !closed}
          status={task.status}
          dueDate={task.dueDate}
          taskLat={task.locationLat}
          taskLng={task.locationLng}
          here={job.here}
          arrived={job.hasArrived}
          arrivedLabel={arrivalStep ? labelOf(arrivalStep) : null}
          onArrived={() => arrivalStep && go(arrivalStep)}
          arrivedBusy={writes.busy}
          blockedReason={blockedReason}
          futureLine={futureLine}
        />

        <JobHandover task={task} files={job.attachments} meId={user?.id} timeOf={(id) => jobTime.view?.byWorker.find((w) => w.user.id === id) ?? null} onWrite={() => setSheet('handover')} />

        <JobTimeCard time={timeNow} paused={paused} startedBy={jobTime.view?.startedBy ?? null} meId={user?.id} />

        <JobCrewCard
          taskId={task.id}
          crew={crew}
          counting={!paused && !closed && stepStartsWork(task.status, capsAt(task.status, steps, workflowName))}
          onMyIssue={() => setSheet('myIssue')}
          onHandOver={() => setSheet('handOverLead')}
        />

        <TourTarget name="taskdetail-facts"><JobFacts facts={facts} /></TourTarget>
        {hasPlace ? <TourTarget name="taskdetail-map"><JobMap lat={task.locationLat!} lng={task.locationLng!} title={task.locationAddress} onOpen={openMaps} /></TourTarget> : null}

        {task.description ? (
          <View style={{ gap: amazen.space(1.5) }}>
            <SectionLabel>{t('job.details')}</SectionLabel>
            <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>{task.description}</AText>
          </View>
        ) : null}

        <TourTarget name="taskdetail-checklist">
          <JobChecklist
            taskId={task.id}
            items={task.checklistItems ?? []}
            mode={checkMode}
            opensAtLabel={opensAt ? labelOf(opensAt) : null}
            meId={user?.id}
            crew={crew.view}
            mayHandOut={crew.isLeader || canAssign}
          />
        </TourTarget>

        {stepSignature ? (
          <Banner tone="neutral" text={t('job.sign.needed')} action={{ label: t('job.sign.open'), onPress: () => setSheet('sign'), disabled: writes.uploading }} />
        ) : null}

        {hasFeatureModule({ orgModules: user?.orgModules }, 'custom_fields') ? <JobFields taskId={task.id} editable={!canceled} /> : null}

        <TourTarget name="taskdetail-files">
        <JobFiles
          files={job.attachments}
          uploading={writes.uploading}
          canAdd={!canceled}
          onCamera={async () => { const p = await takePhoto(); if (p) void writes.addPhotos([p]); }}
          onGallery={async () => { const ps = await pickFromGallery(); if (ps.length) void writes.addPhotos(ps); }}
          onDelete={(f) => { setDeleting(f); setSheet('delete'); }}
        />
        </TourTarget>

        {submissionsShown ? <JobSubmissions submissions={job.submissions} labelOf={labelOf} onLayout={at(submissionsY)} /> : null}

        {reportShown ? <JobReport report={job.report} sayNone={reportSaysNone} onLayout={at(reportY)} /> : null}

        <TourTarget name="taskdetail-activity">
        <JobActivity
          comments={job.comments}
          events={job.events}
          localEvents={job.localEvents}
          created={{ at: task.createdAt, by: task.createdBy }}
          labelOf={labelOf}
          canWrite
          visitNotes={doingTheWork && hasCapability(caps, 'form')}
          busy={writes.busy}
          onSend={writes.addComment}
          onLayout={at(activityY)}
        />
        </TourTarget>
      </ScrollView>

      {keyboard === 0 ? (
        <JobDock
          timer={timer}
          closedText={closedText}
          primary={primary}
          navigate={mode === 'doer' && travelling && hasPlace ? navigate : null}
          onMore={closed && !hasPlace ? null : () => setSheet('more')}
          onEdit={mode === 'overseer' && canEdit ? () => setSheet('edit') : null}
          bottomInset={bottom}
          notice={slotHolder
            ? { tone: 'warn', text: t('job.oneAtATime', { title: slotHolder.title }), action: { label: t('job.openIt'), onPress: () => router.replace(`/task/${slotHolder.id}` as never) } }
            : writes.notice ? { tone: 'critical', text: writes.notice }
            : mode === 'doer' && !paused && !closed && crew.stepsAreLeaders && crew.leader
              ? { tone: 'neutral', text: t('job.crew.leaderMoves', { name: crew.leader.user.firstName }) }
              : null}
        />
      ) : null}

      {/* ⚠️ ONE sheet state — two can never be asked for at once. */}
      <ClockInToStartSheet
        visible={sheet === 'clockIn'}
        onClose={() => { setStartAfterClockIn(null); closeSheet(); }}
        jobTitle={[task.title, task.space?.name].filter(Boolean).join(' · ')}
        busy={clockIn.isBusy || writes.busy}
        onClockIn={clockIn.openClockInModal}
      />
      <LocationPickerSheet {...clockIn.pickerProps} confirmDisabled={clockIn.isClockingIn} />
      <MyIssueSheet visible={sheet === 'myIssue'} onClose={closeSheet} busy={crew.busy} onSend={crew.reportMine} />
      <HandOverLeadSheet visible={sheet === 'handOverLead'} onClose={closeSheet} crew={crew} jobTitle={task.title} />
      <HandoverSheet
        visible={sheet === 'handover'}
        onClose={closeSheet}
        context={[task.title, task.space?.name].filter(Boolean).join(' · ')}
        busy={writes.busy}
        onSend={writes.handover}
      />
      <MoreSheet
        visible={sheet === 'more'}
        onClose={closeSheet}
        title={task.title}
        options={options}
        labelOf={labelOf}
        assigned={!!task.assignedToId}
        onPick={pick}
      />
      <ReportIssueSheet
        visible={sheet === 'issue'}
        onClose={closeSheet}
        context={[task.title, task.space?.name].filter(Boolean).join(' · ')}
        busy={writes.busy}
        onSend={writes.reportIssue}
      />
      <JobConfirmSheet
        visible={sheet === 'decline'}
        onClose={closeSheet}
        title={t('job.decline.title')}
        body={t('job.decline.body')}
        confirmLabel={t('job.decline.confirm')}
        busy={writes.busy}
        onConfirm={() => { setSheet(null); void writes.decline(); }}
      />
      <JobConfirmSheet
        visible={sheet === 'cancel'}
        onClose={closeSheet}
        title={t('job.cancel.title')}
        body={t('job.cancel.body')}
        confirmLabel={t('job.cancel.confirm')}
        busy={writes.busy}
        onConfirm={() => { setSheet(null); void writes.cancelJob(); }}
      />
      <JobConfirmSheet
        visible={sheet === 'delete'}
        onClose={() => { setSheet(null); setDeleting(null); }}
        title={t('job.files.deleteTitle')}
        body={t('job.files.deleteBody', { name: deleting?.fileName ?? '' })}
        confirmLabel={t('common.delete')}
        busy={false}
        onConfirm={() => { const f = deleting; setSheet(null); setDeleting(null); if (f) void writes.deleteAttachment(f.id); }}
      />
      <AssignSheet
        visible={sheet === 'assign'}
        current={task.assignedToId}
        spaceId={task.space?.id ?? null}
        busy={writes.busy}
        onPick={async (m) => { if (await writes.assign(m)) setSheet(null); }}
        onClose={closeSheet}
      />
      <EditSheet
        visible={sheet === 'edit'}
        onClose={closeSheet}
        initial={{ title: task.title, description: task.description, priority: task.priority, locationAddress: task.locationAddress }}
        busy={writes.busy}
        onSave={writes.edit}
      />
      <StepFormSheet
        visible={sheet === 'form' && !!activeForm}
        onClose={closeSheet}
        title={formTarget ? labelOf(formTarget) : ''}
        form={activeForm}
        busy={writes.busy}
        serverErrors={formErrors}
        onSubmit={async (draft, signatures) => {
          if (!formTarget || !activeForm) return false;
          setFormErrors(null);
          const res = await writes.moveWithForm(formTarget, activeForm, draft, signatures);
          if (!res.ok) setFormErrors(res.fieldErrors ?? null);
          return res.ok;
        }}
      />
      <SignSheet
        visible={sheet === 'sign'}
        onClose={closeSheet}
        busy={writes.uploading}
        onSave={writes.addSignature}
      />
    </View>,
  );
}
