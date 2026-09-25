import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { daysLate, getFlowSteps, type FlowStatus } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useIsland } from '../../island/island-context';
import { useOffline, useSyncStatus } from '../../offline/offline-context';
import { loadTaskDetail } from '../../offline/tasks/task-source';
import { SyncChip } from '../../offline/components/sync-chip';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { tasksApi } from '../../lib/api';
import type { Task, TaskEvent } from '../../lib/api/types';
import { AText, Eyebrow, LiveDot } from '../amazen';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { NativeSignaturePad, type NativeSignaturePadHandle } from '../signature-pad-native';
import { hasHour, isMine } from '../home/my-work';
import {
  WRONG_REASONS, declineTarget, has, previousOf, railOf, spanText, timerStart, enteredAt, toneOf, travelling,
  type Tone,
} from './job-flow';
import { VerbButton } from './verb-button';
import { useJobActions } from './use-job-actions';

export type JobView = 'job' | 'more' | 'wrong' | 'finish';

/**
 * THE JOB — `docs/design/job-step.html`, the whole flow in ONE sheet.
 *
 * ⚠️ ONE SHEET, FOUR VIEWS — job, More, Something is wrong, Finishing. Every
 * sheet here is a <Modal> and there is exactly one modal slot; handing over
 * between four of them is how the shift card's buttons went dead. So the
 * views swap INSIDE the one panel and nothing is ever presented twice.
 *
 * ⚠️ NEVER A NAME. Widgets from capabilities, actions from transitions — see
 * job-flow.ts. The only step name read anywhere is BLOCKED, for tone, because
 * no capability says "stopped".
 */
export function JobSheet({ task, steps: stepsIn, view: viewIn, onClose, onOpenFull, onChanged }: {
  task: Task | null;
  /** The workflow the card already resolved; the detail's own wins when it arrives. */
  steps: FlowStatus[] | null;
  view?: JobView;
  onClose: () => void;
  onOpenFull: (task: Task) => void;
  onChanged?: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();
  const offline = useOffline();
  const { operations } = useSyncStatus();
  const { height } = useWindowDimensions();
  const actions = useJobActions(onChanged);

  const [view, setView] = useState<JobView>('job');
  const [detail, setDetail] = useState<Task | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [photos, setPhotos] = useState(0);

  /* A new job, or the card asking for a particular view: start there. */
  useEffect(() => { setView(viewIn ?? 'job'); }, [task?.id, viewIn]);

  /* The detail (workflow, checklist, photos) and the timeline (timer, arrival). */
  useEffect(() => {
    if (!task) { setDetail(null); setEvents([]); setPhotos(0); return; }
    let live = true;
    void loadTaskDetail(task.id, {
      records: offline.records, operations, me: { id: user?.id ?? '', firstName: user?.firstName, lastName: user?.lastName },
    }).then((d) => { if (live) { setDetail(d.task as Task); setPhotos(d.attachments?.length ?? 0); } }).catch(() => undefined);
    void tasksApi.getTimeline(task.id).then((e) => { if (live) setEvents(e ?? []); }).catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per job opened
  }, [task?.id]);

  const job = (detail ?? task) as Task | null;
  const steps = useMemo(() => {
    const own = (detail as unknown as { workflow?: unknown } | null)?.workflow;
    return own ? getFlowSteps(own as never) : stepsIn;
  }, [detail, stepsIn]);

  if (!job) return <BlurSheet visible={false} onClose={onClose}><View /></BlurSheet>;

  const current = steps?.find((s) => s.key === job.status) ?? null;
  const onward = current && steps
    ? current.transitions.map((k) => steps.find((s) => s.key === k)).filter((s): s is FlowStatus => !!s && !s.isCanceled).sort((a, b) => a.position - b.position)
    : [];
  const mine = isMine(job, user?.id);
  const next = mine ? onward[0] ?? null : null;
  const late = Math.max(0, daysLate(job.dueDate ?? null) ?? 0);
  const tone = toneOf(job.status, current?.isFinal ? 0 : late);

  const close = () => { setView('job'); onClose(); };

  return (
    <BlurSheet visible={!!task} onClose={close}>
      <SheetPanel onClose={close} maxHeightFraction={0.92}>
        <ScrollView style={{ maxHeight: height * 0.82 }} contentContainerStyle={{ gap: amazen.space(4), paddingBottom: amazen.space(2) }} keyboardShouldPersistTaps="handled">
          {view === 'job' ? (
            <StepView
              job={job} steps={steps} current={current} next={next} rest={mine ? onward.slice(1) : []}
              tone={tone} late={late} mine={mine} events={events} photos={photos} busy={actions.busy === job.id}
              onVerb={(to) => { if (to.isFinal) setView('finish'); else void actions.advance(job, current!, to); }}
              onWrong={() => setView('wrong')} onMore={() => setView('more')}
            />
          ) : null}
          {view === 'more' ? (
            <MoreView
              job={job} steps={steps} current={current} rest={mine ? onward.slice(1) : []} mine={mine}
              onBack={() => setView('job')}
              onVerb={(to) => { if (to.isFinal) setView('finish'); else { setView('job'); void actions.advance(job, current!, to); } }}
              onWrong={() => setView('wrong')}
              onDecline={() => { void actions.decline(job); close(); }}
              onOpenFull={() => { close(); onOpenFull(job); }}
            />
          ) : null}
          {view === 'wrong' ? (
            <WrongView job={job} busy={actions.busy === job.id} onBack={() => setView('job')}
              onSend={(reason, severity, note) => { void actions.reportWrong(job, { reason, severity, note }).then(close); }} />
          ) : null}
          {view === 'finish' && current && next ? (
            <FinishView job={job} steps={steps!} current={current} to={next} events={events} photos={photos} busy={actions.busy === job.id}
              onBack={() => setView('job')}
              onFinish={(input) => { void actions.finish(job, current, next, input).then(close); }} />
          ) : null}
          {view === 'finish' && !(current && next) ? (
            <AText variant="body" tone="muted">{t('job.cannotFinish', { defaultValue: 'This job cannot be finished from here. Open the full job.' })}</AText>
          ) : null}
        </ScrollView>
      </SheetPanel>
    </BlurSheet>
  );
}

/* ================================================================ the step */

function StepView({ job, steps, current, next, tone, late, mine, events, photos, busy, onVerb, onWrong, onMore }: {
  job: Task; steps: FlowStatus[] | null; current: FlowStatus | null; next: FlowStatus | null; rest: FlowStatus[];
  tone: Tone; late: number; mine: boolean; events: TaskEvent[]; photos: number; busy: boolean;
  onVerb: (to: FlowStatus) => void; onWrong: () => void; onMore: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatTime, formatDate } = useTimeFormatSafe();

  const prev = current && steps ? previousOf(steps, current) : null;
  const tracking = mine && has(current, 'gps');
  const arrivedFromTravel = mine && !!prev && has(prev, 'gps') && !has(current, 'gps');
  const started = steps && has(current, 'timer') ? timerStart(events, steps) : null;
  const since = current ? enteredAt(events, current.key) : null;
  const r0 = job.routeStartedAt ? Date.parse(job.routeStartedAt) : null;
  const r1 = job.routeEndedAt ? Date.parse(job.routeEndedAt) : null;
  const canNav = job.locationLat != null && job.locationLng != null && Number.isFinite(Number(job.locationLat)) && Number.isFinite(Number(job.locationLng));
  const showNav = !!current && travelling(current, next) && canNav;

  const chips: { text: string; live?: boolean }[] = [];
  if (tracking) chips.push({ text: t('job.chip.tracking', { defaultValue: 'Travel is being tracked' }), live: true });
  if (tracking && r0) chips.push({ text: t('job.chip.driving', { time: spanText(Date.now() - r0), defaultValue: `${spanText(Date.now() - r0)} driving` }) });
  if (arrivedFromTravel && (r1 || since)) chips.push({ text: t('job.chip.onSite', { time: formatTime(new Date(r1 ?? since!).toISOString()), defaultValue: 'On site' }), live: true });
  if (started) chips.push({ text: t('job.chip.onJob', { time: spanText(Date.now() - started), defaultValue: `${spanText(Date.now() - started)} on the job` }), live: true });
  if (photos > 0) chips.push({ text: t('job.chip.photos', { count: photos, defaultValue: `${photos} photos` }) });

  const facts: [string, string, Tone?][] = [];
  if (arrivedFromTravel && r0 && r1) facts.push([t('job.fact.travelled', { defaultValue: 'Travelled' }), spanText(r1 - r0)]);
  if (job.dueDate) facts.push([t('job.fact.due', { defaultValue: 'Due' }), formatDate(job.dueDate) + (hasHour(job.dueDate) ? ` · ${formatTime(job.dueDate)}` : '')]);
  if (late > 0 && !current?.isFinal) facts.push([t('job.fact.late', { defaultValue: 'Late' }), t('job.days', { count: late, defaultValue: `${late} days` }), 'warn']);
  const space = (job as unknown as { space?: { name?: string } }).space?.name;
  if (space) facts.push([t('job.fact.workspace', { defaultValue: 'Workspace' }), space]);
  facts.push([t('job.fact.assigned', { defaultValue: 'Assigned' }), job.assignedTo ? `${job.assignedTo.firstName} ${job.assignedTo.lastName}`.trim() : t('job.nobody', { defaultValue: 'Nobody yet' }), job.assignedTo ? undefined : 'warn']);

  return (
    <>
      <Header job={job} label={current?.label ?? job.status.replace(/_/g, ' ')} tone={tone} />
      {steps ? <Rail steps={steps} current={job.status} /> : null}
      {chips.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2) }}>
          {chips.map((ch) => <Chip key={ch.text} text={ch.text} live={ch.live} />)}
        </View>
      ) : null}

      {mine && has(current, 'checklist') ? <Checklist job={job} /> : <Facts rows={facts} />}
      {job.description && !has(current, 'checklist') ? <AText variant="body" tone="ink" numberOfLines={4}>{job.description}</AText> : null}

      <View style={{ gap: amazen.space(2.5) }}>
        {next && current ? <VerbButton current={current} to={next} busy={busy} onPress={() => onVerb(next)} flex={false} /> : null}
        {!mine && !current?.isFinal ? (
          <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
            {t('job.notYours', { defaultValue: 'Not your job — you can follow it, not move it.' })}
          </AText>
        ) : null}
        <View style={{ flexDirection: 'row', gap: amazen.space(2.5) }}>
          {showNav ? (
            <Soft label={t('taskDetail.navigate', { defaultValue: 'Navigate' })} onPress={() => openMaps(job)} />
          ) : mine && !current?.isFinal ? (
            <Soft label={t('job.wrong.title', { defaultValue: 'Something is wrong' })} onPress={onWrong} />
          ) : null}
          <Soft label={t('job.more', { defaultValue: 'More' })} onPress={onMore} />
        </View>
      </View>
    </>
  );
}

function Header({ job, label, tone, eyebrow }: { job: Task; label: string; tone: Tone; eyebrow?: string }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const dot = tone === 'critical' ? c.critical : tone === 'warn' ? c.warn : c.accent;
  const prio = job.priority === 'URGENT' ? 'critical' : job.priority === 'HIGH' ? 'warn' : 'muted';
  return (
    <View style={{ gap: amazen.space(1.5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
        <LiveDot color={dot} live={false} />
        <Eyebrow tone={tone === 'critical' ? 'critical' : tone === 'warn' ? 'warn' : 'accent'} style={{ flex: 1 }}>{eyebrow ?? label}</Eyebrow>
        <SyncChip entityId={job.id} />
        {job.priority && job.priority !== 'LOW' ? (
          <View style={{ borderWidth: 1, borderColor: prio === 'muted' ? c.lineGlass : prio === 'critical' ? c.critical : c.warn, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}>
            <AText variant="caption" tone={prio === 'muted' ? 'muted' : prio} numeric style={{ fontSize: 10, letterSpacing: 1 }}>{job.priority}</AText>
          </View>
        ) : null}
      </View>
      <AText variant="h2" tone="strong" style={{ fontWeight: '400' }}>{job.title}</AText>
      {job.locationAddress ? <AText variant="caption" tone="muted" numberOfLines={1}>{job.locationAddress}</AText> : null}
    </View>
  );
}

/** The rail, WITH LABELS — what is next is the only question worth asking on this screen. */
function Rail({ steps, current }: { steps: FlowStatus[]; current: string }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const rail = railOf(steps);
  const at = rail.findIndex((s) => s.key === current);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {rail.map((s, i) => {
          const done = at >= 0 && i < at;
          const now = i === at;
          return (
            <React.Fragment key={s.key}>
              {i > 0 ? <View style={{ flex: 1, height: 2, backgroundColor: at >= 0 && i <= at ? c.accent : c.lineGlass }} /> : null}
              <View style={{
                width: now ? 14 : 8, height: now ? 14 : 8, borderRadius: 7,
                backgroundColor: done || now ? c.accent : 'transparent',
                borderWidth: now ? 3 : 1.5, borderColor: now ? c.accentTint : done ? c.accent : c.inkMuted,
              }} />
            </React.Fragment>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {rail.map((s, i) => (
          <AText key={s.key} variant="caption" tone={i === at ? 'accent' : 'muted'} numberOfLines={1}
            style={{ flex: 1, fontSize: 8.5, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: i === 0 ? 'left' : i === rail.length - 1 ? 'right' : 'center' }}>
            {s.label}
          </AText>
        ))}
      </View>
    </View>
  );
}

/** A fact is a chip, never a full-width filled bar. */
function Chip({ text, live }: { text: string; live?: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: amazen.radius.full, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: live ? c.accentTint : c.tile }}>
      {live ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} /> : null}
      <AText variant="caption" tone={live ? 'accent' : 'ink'}>{text}</AText>
    </View>
  );
}

function Facts({ rows }: { rows: [string, string, Tone?][] }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ backgroundColor: c.sunken, borderRadius: 18, paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(4), gap: amazen.space(2.5) }}>
      {rows.map(([k, v, tone]) => (
        <View key={k} style={{ flexDirection: 'row', gap: amazen.space(3) }}>
          <AText variant="caption" tone="muted" style={{ flex: 1 }}>{k}</AText>
          <AText variant="caption" tone={tone === 'warn' ? 'warn' : 'strong'} style={{ textAlign: 'right', flexShrink: 1 }}>{v}</AText>
        </View>
      ))}
    </View>
  );
}

/** The checklist is tickable, and counted in its own header. */
function Checklist({ job }: { job: Task }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const island = useIsland();
  const c = amazen.color;
  const initial = ((job as unknown as { checklistItems?: { id: string; text?: string; title?: string; isCompleted?: boolean; completed?: boolean }[] }).checklistItems ?? [])
    .map((i) => ({ id: i.id, text: i.text ?? i.title ?? '', on: !!(i.isCompleted ?? i.completed) }));
  const [items, setItems] = useState(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the job or its item count changes, not on every render's new array
  useEffect(() => { setItems(initial); }, [job.id, initial.length]);
  const done = items.filter((i) => i.on).length;
  const toggle = async (id: string) => {
    const was = items.find((i) => i.id === id)?.on ?? false;
    setItems((xs) => xs.map((i) => (i.id === id ? { ...i, on: !was } : i)));
    try { await tasksApi.setChecklistItem(job.id, id, !was); }
    catch {
      setItems((xs) => xs.map((i) => (i.id === id ? { ...i, on: was } : i)));
      island.error(t('job.checkFailed', { defaultValue: 'Could not save that tick. It needs a connection.' }));
    }
  };
  if (!items.length) return null;
  return (
    <View style={{ backgroundColor: c.sunken, borderRadius: 18, paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(4), gap: amazen.space(1) }}>
      <View style={{ flexDirection: 'row' }}>
        <Eyebrow tone="muted" style={{ flex: 1 }}>{t('job.thisStep', { defaultValue: 'This step' })}</Eyebrow>
        <AText variant="caption" tone="accent" numeric>{done} / {items.length}</AText>
      </View>
      {items.map((i) => (
        <Pressable key={i.id} onPress={() => void toggle(i.id)} accessibilityRole="checkbox" accessibilityState={{ checked: i.on }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2) }}>
          <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.8, borderColor: i.on ? c.accent : c.inkMuted, backgroundColor: i.on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {i.on ? <AText variant="caption" tone="accentInk" style={{ fontSize: 12, lineHeight: 14 }}>✓</AText> : null}
          </View>
          <AText variant="body" tone={i.on ? 'muted' : 'strong'} style={{ flex: 1, textDecorationLine: i.on ? 'line-through' : 'none' }}>{i.text}</AText>
        </Pressable>
      ))}
    </View>
  );
}

/* ================================================================ More */

function MoreView({ job, steps, current, rest, mine, onBack, onVerb, onWrong, onDecline, onOpenFull }: {
  job: Task; steps: FlowStatus[] | null; current: FlowStatus | null; rest: FlowStatus[]; mine: boolean;
  onBack: () => void; onVerb: (to: FlowStatus) => void; onWrong: () => void; onDecline: () => void; onOpenFull: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const canNav = job.locationLat != null && job.locationLng != null;
  const decline = mine && current && steps ? declineTarget(steps, current) : null;
  return (
    <>
      <View style={{ gap: 4 }}>
        <Eyebrow tone="muted">{t('job.more', { defaultValue: 'More' })}</Eyebrow>
        <AText variant="h3" tone="strong">{job.title}</AText>
      </View>
      <View style={{ gap: amazen.space(2) }}>
        {rest.map((s) => <Row key={s.key} label={s.label} onPress={() => onVerb(s)} />)}
        {mine && !current?.isFinal ? <Row label={t('job.wrong.title', { defaultValue: 'Something is wrong' })} onPress={onWrong} /> : null}
        {canNav ? <Row label={t('job.openMaps', { defaultValue: 'Open in maps' })} onPress={() => openMaps(job)} /> : null}
        <Row label={t('job.openFull', { defaultValue: 'Open the full job' })} hint={t('job.openFullHint', { defaultValue: 'History, photos, reassign and edit' })} onPress={onOpenFull} />
        {decline ? <Row label={t('job.decline', { defaultValue: 'Decline this job' })} hint={t('job.declineHint', { defaultValue: 'It goes back to the office' })} tone="critical" onPress={onDecline} /> : null}
      </View>
      <BackLink onPress={onBack} />
    </>
  );
}

/* ================================================================ Something is wrong */

function WrongView({ job, busy, onBack, onSend }: {
  job: Task; busy: boolean; onBack: () => void; onSend: (reason: string, severity: string, note?: string) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const [pick, setPick] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const reason = WRONG_REASONS.find((r) => r.key === pick);
  const label = (k: string) => t(`job.wrong.reason.${k}`, { defaultValue: { parts: 'Waiting for parts', access: 'Cannot get in', customer: 'Customer away', unsafe: 'Not safe', wrongJob: 'Wrong job', other: 'Something else' }[k] });
  return (
    <>
      <View style={{ gap: amazen.space(1.5) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
          <LiveDot color={c.warn} live={false} />
          <Eyebrow tone="warn">{t('job.wrong.title', { defaultValue: 'Something is wrong' })}</Eyebrow>
        </View>
        <AText variant="h2" tone="strong" style={{ fontWeight: '400' }}>{job.title}</AText>
        {/* ⚠️ It says who it reaches, and that nothing is cancelled. */}
        <AText variant="caption" tone="muted">
          {t('job.wrong.who', { defaultValue: 'The people responsible for this workspace get this straight away. The job stays where it is — nothing is cancelled.' })}
        </AText>
      </View>
      <Eyebrow tone="muted">{t('job.wrong.tapOne', { defaultValue: 'What is it · tap one' })}</Eyebrow>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2) }}>
        {WRONG_REASONS.map((r) => {
          const on = pick === r.key;
          return (
            <Pressable key={r.key} onPress={() => setPick(r.key)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={{ borderRadius: amazen.radius.full, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent' }}>
              <AText variant="caption" tone={on ? 'accent' : 'ink'} style={{ fontSize: 13 }}>{label(r.key)}</AText>
            </Pressable>
          );
        })}
      </View>
      {noteOpen ? (
        <TextInput
          value={note} onChangeText={setNote} autoFocus multiline maxLength={1000}
          placeholder={t('job.wrong.notePlaceholder', { defaultValue: 'Anything the office should know' })}
          placeholderTextColor={c.inkMuted}
          style={{ minHeight: 76, borderRadius: 16, padding: amazen.space(3.5), backgroundColor: c.sunken, color: c.inkStrong, fontFamily: amazen.type.body.fontFamily, fontSize: 15, textAlignVertical: 'top' }}
        />
      ) : (
        <Pressable onPress={() => setNoteOpen(true)} accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: amazen.space(4), paddingVertical: amazen.space(3.5), backgroundColor: c.tile }}>
          <AText variant="body" tone="ink" style={{ flex: 1 }}>+  {t('job.wrong.addNote', { defaultValue: 'Add a note' })}</AText>
          <AText variant="caption" tone="muted">{t('job.optional', { defaultValue: 'optional' })}</AText>
        </Pressable>
      )}
      <PrimaryPill label={t('job.wrong.send', { defaultValue: 'Send it' })} disabled={!reason || busy} onPress={() => reason && onSend(label(reason.key), reason.severity, note)} />
      <BackLink label={t('job.notNow', { defaultValue: 'Not now' })} onPress={onBack} />
    </>
  );
}

/* ================================================================ Finishing */

function FinishView({ job, steps, current, to, events, photos, busy, onBack, onFinish }: {
  job: Task; steps: FlowStatus[]; current: FlowStatus; to: FlowStatus; events: TaskEvent[]; photos: number; busy: boolean;
  onBack: () => void;
  onFinish: (input: { summary: string; workSeconds: number; signature?: string | null; customerName?: string; customerSignature?: string | null }) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatTime } = useTimeFormatSafe();
  const c = amazen.color;
  const [summary, setSummary] = useState('');
  const [signOpen, setSignOpen] = useState(false);
  const [signed, setSigned] = useState(false);
  const [custName, setCustName] = useState('');
  const [custSigned, setCustSigned] = useState(false);
  const pad = useRef<NativeSignaturePadHandle>(null);
  const custPad = useRef<NativeSignaturePadHandle>(null);

  const started = timerStart(events, steps);
  const now = Date.now();
  const counted = started ? now - started : null;
  const items = ((job as unknown as { checklistItems?: { isCompleted?: boolean }[] }).checklistItems ?? []);
  const wantsSignature = has(to, 'signature');
  const hasCustomer = !!(job as unknown as { customerId?: string | null }).customerId;
  const wantsCustomer = wantsSignature && hasCustomer;
  const ready = summary.trim().length > 0 && (!wantsSignature || signed);

  const submit = async () => {
    const signature = wantsSignature ? await pad.current?.toPng() ?? null : null;
    const customerSignature = wantsCustomer ? await custPad.current?.toPng() ?? null : null;
    onFinish({ summary, workSeconds: counted ? counted / 1000 : 0, signature, customerName: wantsCustomer ? custName : undefined, customerSignature });
  };

  const rows: [string, string][] = [];
  if (started) rows.push([t('job.receipt.started', { defaultValue: 'Started' }), formatTime(new Date(started).toISOString())]);
  rows.push([t('job.receipt.finishing', { defaultValue: 'Finishing' }), formatTime(new Date(now).toISOString())]);
  if (items.length) rows.push([t('job.receipt.checklist', { defaultValue: 'Checklist' }), `${items.filter((i) => i.isCompleted).length} of ${items.length}`]);
  rows.push([t('job.receipt.photos', { defaultValue: 'Photos' }), String(photos)]);

  return (
    <>
      <View style={{ gap: amazen.space(1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
          <LiveDot color={c.accent} live={false} />
          <Eyebrow tone="accent">{t('job.finishing', { defaultValue: 'Finishing' })}</Eyebrow>
        </View>
        {/* ⚠️ 2h 41m, not 137 days — the timer runs from the first timer step, never from creation. */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
          {counted !== null ? (
            <>
              <AText variant="display" tone="strong" numeric style={{ fontSize: 52, lineHeight: 58 }}>{Math.floor(counted / 3600000)}</AText>
              <AText variant="h3" tone="muted" style={{ marginRight: 8 }}>h</AText>
              <AText variant="display" tone="strong" numeric style={{ fontSize: 52, lineHeight: 58 }}>{Math.floor((counted % 3600000) / 60000)}</AText>
              <AText variant="h3" tone="muted">m</AText>
            </>
          ) : (
            <AText variant="h2" tone="strong" style={{ fontWeight: '300' }}>{job.title}</AText>
          )}
        </View>
        <AText variant="caption" tone="muted">{counted !== null ? t('job.onTheJob', { defaultValue: 'on the job' }) : t('job.noTimer', { defaultValue: 'No time was counted on this job.' })}</AText>
      </View>

      {/* The receipt — the same language as the clock-out sheet, because it is the same kind of moment. */}
      <View style={{ backgroundColor: c.sunken, borderRadius: 18, paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(4), gap: amazen.space(2.5) }}>
        {rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row' }}>
            <AText variant="caption" tone="muted" style={{ flex: 1 }}>{k}</AText>
            <AText variant="caption" tone="strong" numeric>{v}</AText>
          </View>
        ))}
        {counted !== null ? (
          <>
            <View style={{ height: 1, backgroundColor: c.lineWell }} />
            <View style={{ flexDirection: 'row' }}>
              <AText variant="body" tone="ink" style={{ flex: 1 }}>{t('job.receipt.counted', { defaultValue: 'Counted' })}</AText>
              <AText variant="body" tone="strong" numeric>{spanText(counted)}</AText>
            </View>
          </>
        ) : null}
      </View>

      <View style={{ gap: amazen.space(2) }}>
        <Eyebrow tone="muted">{t('job.whatDidYouDo', { defaultValue: 'What did you do' })} <AText variant="eyebrow" tone="warn">· {t('job.required', { defaultValue: 'required' })}</AText></Eyebrow>
        <TextInput
          value={summary} onChangeText={setSummary} maxLength={200}
          placeholder={t('job.aLine', { defaultValue: 'A line is enough…' })} placeholderTextColor={c.inkMuted}
          style={{ borderRadius: 16, paddingHorizontal: amazen.space(4), paddingVertical: amazen.space(3.5), backgroundColor: c.sunken, color: c.inkStrong, fontFamily: amazen.type.body.fontFamily, fontSize: 15 }}
        />
      </View>

      {wantsSignature ? (
        <View style={{ gap: amazen.space(2) }}>
          <Eyebrow tone="muted">{t('job.signOff', { defaultValue: 'Sign off · this step asks for one' })}</Eyebrow>
          {signOpen ? (
            <View style={{ height: 150, borderRadius: 16, backgroundColor: c.sunken, overflow: 'hidden' }}>
              <NativeSignaturePad ref={pad} penColor={c.inkStrong} onChange={setSigned} />
            </View>
          ) : (
            <Row label={t('job.yourSignature', { defaultValue: 'Your signature' })} onPress={() => setSignOpen(true)} chevron />
          )}
          {wantsCustomer ? (
            <>
              <TextInput value={custName} onChangeText={setCustName} placeholder={t('job.customerName', { defaultValue: "Customer's name" })} placeholderTextColor={c.inkMuted}
                style={{ borderRadius: 16, paddingHorizontal: amazen.space(4), paddingVertical: amazen.space(3.5), backgroundColor: c.sunken, color: c.inkStrong, fontFamily: amazen.type.body.fontFamily, fontSize: 15 }} />
              <View style={{ height: 150, borderRadius: 16, backgroundColor: c.sunken, overflow: 'hidden' }}>
                <NativeSignaturePad ref={custPad} penColor={c.inkStrong} onChange={setCustSigned} />
              </View>
              {!custSigned ? <AText variant="caption" tone="muted">{t('job.customerSigns', { defaultValue: 'Hand the phone over for the customer to sign (optional).' })}</AText> : null}
            </>
          ) : null}
        </View>
      ) : null}

      <VerbButton current={current} to={to} busy={busy || !ready} onPress={() => void submit()} flex={false} />
      <BackLink onPress={onBack} />
    </>
  );
}

/* ================================================================ small parts */

function Soft({ label, onPress }: { label: string; onPress: () => void }) {
  const { amazen } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ flex: 1, minHeight: amazen.layout.tapMin, borderRadius: amazen.radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: amazen.color.tile, opacity: pressed ? 0.8 : 1 })}>
      <AText variant="body" tone="strong" style={{ fontSize: 14 }}>{label}</AText>
    </Pressable>
  );
}

function PrimaryPill({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({ minHeight: amazen.layout.tapMin + 2, borderRadius: amazen.radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSolid, opacity: disabled ? 0.45 : pressed ? 0.88 : 1 })}>
      <AText variant="body" tone="accentInk" style={{ fontFamily: amazen.type.h3.fontFamily }}>{label}</AText>
    </Pressable>
  );
}

function Row({ label, hint, tone = 'strong', chevron, onPress }: { label: string; hint?: string; tone?: 'strong' | 'critical'; chevron?: boolean; onPress: () => void }) {
  const { amazen } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: amazen.space(4), paddingVertical: amazen.space(3.5), backgroundColor: amazen.color.tile, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ flex: 1, gap: 2 }}>
        <AText variant="body" tone={tone}>{label}</AText>
        {hint ? <AText variant="caption" tone="muted">{hint}</AText> : null}
      </View>
      {chevron ? <AText variant="body" tone="muted">›</AText> : null}
    </Pressable>
  );
}

function BackLink({ label, onPress }: { label?: string; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={10} style={{ alignSelf: 'center', paddingVertical: 4 }}>
      <AText variant="caption" tone="muted">{label ?? t('common.back', { defaultValue: 'Back' })}</AText>
    </Pressable>
  );
}

function openMaps(job: Task) {
  const lat = Number(job.locationLat);
  const lng = Number(job.locationLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const url = Platform.select({ ios: `maps:0,0?daddr=${lat},${lng}`, android: `google.navigation:q=${lat},${lng}` });
  if (url) void Linking.openURL(url).catch(() => Linking.openURL(`geo:${lat},${lng}`));
}

/** `formatTime` / a short date, in the member's own 12h/24h preference. */
function useTimeFormatSafe() {
  const tf = useTimeFormat() as unknown as { formatTime: (s: string) => string; formatDate?: (s: string) => string };
  const formatDate = useCallback((s: string) => (tf.formatDate ? tf.formatDate(s) : new Date(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })), [tf]);
  return { formatTime: tf.formatTime, formatDate };
}
