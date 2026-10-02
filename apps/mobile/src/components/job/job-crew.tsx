import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { AText, PrimaryButton } from '../amazen';
import { Banner, ChoiceRow, Dot, Initials, JobField, JobSheet, Pill, QuietButton, SectionLabel, SheetOption } from './job-ui';
import type { CrewControls, CrewMember } from './use-crew';
import { useOffline, useSyncStatus } from '../../offline/offline-context';
import { refusedCrewCopy, refusedCrewOps } from '../../offline/tasks/refused-crew';

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/**
 * The crew on a job (shared tasks/crew.ts) — who is on it now, who has
 * stopped and why, who leads; and this person's own controls: join ("I'm with
 * them"), My issue / Back to work, Leave, and — for whoever leads — Hand over.
 *
 * Renders nothing on a job with one worker: they are the crew and the leader.
 */
export function JobCrewCard({
  taskId,
  crew,
  counting,
  onMyIssue,
  onHandOver,
}: {
  taskId: string;
  crew: CrewControls;
  /** The job is under way (a counted step, not paused) — joining means something. */
  counting: boolean;
  onMyIssue: () => void;
  onHandOver: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatClock } = useTimeFormat();
  const c = amazen.color;
  const { view, me, leader, isLeader, isCrew, busy } = crew;
  /*
    A crew action this phone queued and the server refused after (join, leave,
    my issue…): said here, on its job, until dismissed — refused-crew.ts.
  */
  const { operations } = useSyncStatus();
  const { running: engine } = useOffline();
  const refused = refusedCrewOps(operations, taskId)[0] ?? null;
  const refusedCopy = refused ? refusedCrewCopy(t, refused) : null;
  if ((!view || !isCrew) && !refused) return null;
  const notice = refused && refusedCopy ? (
    <Banner
      tone="critical"
      text={`${refusedCopy.title} — ${refusedCopy.reason}`}
      action={{ label: t('shiftClock.refused.dismiss'), onPress: () => void engine?.discard(refused.id) }}
    />
  ) : null;
  if (!view || !isCrew) return notice;

  const onJob = view.members.filter((m) => m.joined).length;
  const leadLine = !leader
    ? t('job.crew.noLeader')
    : view.leader.acting
      ? t('job.crew.acting', { name: leader.user.firstName })
      : view.leader.source === 'TODAY'
        ? t('job.crew.leadsToday', { name: leader.user.firstName })
        : t('job.crew.leads', { name: leader.user.firstName });

  const status = (m: CrewMember): { text: string; tone: 'accent' | 'warn' | 'dim' } => {
    if (m.joined && m.selfBlockedSince) return { text: m.selfBlockReason ? t('job.crew.stoppedWhy', { reason: m.selfBlockReason }) : t('job.crew.stopped'), tone: 'warn' };
    if (m.joined) return { text: t('job.crew.onSince', { time: m.since ? formatClock(m.since) : '' }), tone: 'accent' };
    if (!m.onClock) return { text: t('job.crew.notClockedIn'), tone: 'dim' };
    return { text: t('job.crew.notOnJob'), tone: 'dim' };
  };

  return (
    <View style={{ backgroundColor: c.tile, borderRadius: amazen.radius.field, padding: amazen.space(4), gap: amazen.space(3) }}>
      {notice}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
        <SectionLabel>{t('job.crew.title', { count: onJob, total: view.members.length })}</SectionLabel>
        <View style={{ flex: 1 }} />
        <AText variant="caption" tone={view.leader.acting ? 'warn' : 'muted'} numberOfLines={1} style={{ flexShrink: 1 }}>{leadLine}</AText>
      </View>

      <View style={{ gap: amazen.space(2.5) }}>
        {view.members.map((m) => {
          const s = status(m);
          const leads = m.user.id === view.leader.userId;
          return (
            <View key={m.user.id} style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3) }} accessibilityLabel={`${fullName(m.user)}. ${s.text}`}>
              <Initials first={m.user.firstName} last={m.user.lastName} size={30} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5 }}>
                  {fullName(m.user)}{m.user.id === me?.user.id ? ` ${t('job.facts.you')}` : ''}
                </AText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
                  <Dot tone={s.tone} size={6} />
                  <AText variant="caption" tone={s.tone === 'warn' ? 'warn' : 'muted'} numberOfLines={1} style={{ flexShrink: 1 }}>{s.text}</AText>
                </View>
              </View>
              {leads ? <Pill label={view.leader.acting ? t('job.crew.actingPill') : t('job.crew.leaderPill')} tone={view.leader.acting ? 'warn' : 'accent'} /> : null}
            </View>
          );
        })}
      </View>

      {me ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2) }}>
          {!me.joined && counting ? (
            <QuietButton tone="accent" label={leader && !isLeader ? t('job.crew.withThem', { name: leader.user.firstName }) : t('job.crew.join')} onPress={() => void crew.join(!isLeader)} disabled={busy} />
          ) : null}
          {me.joined && me.selfBlockedSince ? <QuietButton tone="accent" label={t('job.crew.backToWork')} onPress={() => void crew.resumeMine()} disabled={busy} /> : null}
          {me.joined && !me.selfBlockedSince ? <QuietButton label={t('job.crew.myIssue')} onPress={onMyIssue} disabled={busy} /> : null}
          {me.joined ? <QuietButton label={t('job.crew.leave')} onPress={() => void crew.leave()} disabled={busy} /> : null}
          {isLeader ? <QuietButton label={t('job.crew.handOver')} onPress={onHandOver} disabled={busy} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** "My issue" — only this person's time stops; the job and the crew carry on. */
export function MyIssueSheet({ visible, onClose, busy, onSend }: { visible: boolean; onClose: () => void; busy: boolean; onSend: (reason: string) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => { if (visible) setReason(''); }, [visible]);
  return (
    <JobSheet visible={visible} onClose={onClose} title={t('job.crew.myIssueTitle')} busy={busy}>
      <Banner tone="neutral" text={t('job.crew.myIssueHint')} />
      <JobField value={reason} onChangeText={setReason} placeholder={t('job.crew.myIssuePlaceholder')} multiline maxLength={500} />
      <PrimaryButton label={t('job.crew.myIssueSend')} onPress={() => void onSend(reason.trim()).then((ok) => ok && onClose())} disabled={!reason.trim()} loading={busy} />
    </JobSheet>
  );
}

/**
 * Hand THIS job's lead over — only to somebody already on its crew, for today
 * or for good. The leader's other jobs do not change.
 */
export function HandOverLeadSheet({
  visible,
  onClose,
  crew,
  jobTitle,
}: {
  visible: boolean;
  onClose: () => void;
  crew: CrewControls;
  jobTitle: string;
}) {
  const { t } = useTranslation();
  const [to, setTo] = useState<string | null>(null);
  const [scope, setScope] = useState<'TODAY' | 'PERMANENT'>('TODAY');
  useEffect(() => { if (visible) { setTo(null); setScope('TODAY'); } }, [visible]);
  const others = (crew.view?.members ?? []).filter((m) => m.user.id !== crew.view?.leader.userId);
  return (
    <JobSheet visible={visible} onClose={onClose} title={t('job.crew.handOverTitle')} eyebrow={jobTitle} busy={crew.busy}>
      <Banner tone="neutral" text={t('job.crew.handOverHint')} />
      <View style={{ gap: 8 }}>
        {others.map((m) => (
          <SheetOption
            key={m.user.id}
            label={to === m.user.id ? `✓  ${fullName(m.user)}` : fullName(m.user)}
            tone={to === m.user.id ? 'accent' : 'strong'}
            hint={m.joined ? t('job.crew.onJobShort') : t('job.crew.notOnJob')}
            onPress={() => setTo(m.user.id)}
          />
        ))}
      </View>
      <ChoiceRow options={[{ key: 'TODAY', label: t('job.crew.forToday') }, { key: 'PERMANENT', label: t('job.crew.forGood') }]} value={scope} onChange={setScope} />
      <PrimaryButton
        label={t('job.crew.handOverSend')}
        onPress={() => to && void crew.handOver(to, scope).then((ok) => ok && onClose())}
        disabled={!to}
        loading={crew.busy}
      />
    </JobSheet>
  );
}
