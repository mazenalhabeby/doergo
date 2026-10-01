import React, { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import type { TaskEvent } from '../../lib/api';
import { AText } from '../amazen';
import { SendGlyph } from './job-glyphs';
import { Initials, JobField, RoundButton, SectionLabel } from './job-ui';
import type { JobComment, LocalEvent } from './use-job';

type Row =
  | { kind: 'comment'; id: string; at: string; first: string; last: string; text: string; pending: boolean }
  | { kind: 'event'; id: string; at: string; text: string; pending: boolean };

/**
 * Activity — notes and the job's steps in one feed, oldest first, with the
 * compose line at its end (`renderDetail()`'s last block).
 *
 * ⚠️ THE STEPS COME FROM THE TIMELINE WHEN IT HAS BEEN ASKED FOR, and until
 * then from what the page already holds: when the job was created and by
 * whom, and every step taken on this phone this session. The timeline is one
 * request, made when this section first comes on screen — never on open.
 */
export function JobActivity({
  comments,
  events,
  localEvents,
  created,
  labelOf,
  canWrite,
  visitNotes,
  busy,
  onSend,
  onLayout,
}: {
  comments: JobComment[];
  events: TaskEvent[] | null;
  localEvents: LocalEvent[];
  created: { at: string; by?: { firstName?: string; lastName?: string } | null };
  labelOf: (statusKey: string) => string;
  canWrite: boolean;
  /** The step has a visit form — the compose line says so. */
  visitNotes: boolean;
  busy: boolean;
  onSend: (text: string) => Promise<boolean>;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatDateRelative, formatTime } = useTimeFormat();
  const c = amazen.color;
  const [draft, setDraft] = useState('');

  const rows = useMemo<Row[]>(() => {
    const name = (u?: { firstName?: string; lastName?: string } | null) => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : '');
    const describe = (type: string, meta: Record<string, any> | undefined, who: string): string | null => {
      const by = (s: string) => (who ? `${s} · ${who}` : s);
      switch (type) {
        case 'CREATED': return who ? t('job.activity.created', { name: who }) : t('job.activity.createdPlain');
        case 'STATUS_CHANGED': {
          const to = String(meta?.newStatus ?? '');
          if (!to) return null;
          if (to === 'BLOCKED' && meta?.reason) return t('job.activity.blocked', { reason: String(meta.reason) });
          return by(labelOf(to));
        }
        case 'ASSIGNED': return by(t('job.activity.assigned'));
        case 'UNASSIGNED': return by(t('job.activity.unassigned'));
        case 'ATTACHMENT_ADDED': return by(t('job.activity.photoAdded'));
        // Stopped at a clock-out, picked back up, and what was written about it.
        case 'PAUSED': return by(t('job.activity.paused'));
        case 'RESUMED': return by(t('job.activity.resumed'));
        case 'HANDOVER_ADDED': return meta?.content ? by(t('job.activity.handover', { text: String(meta.content) })) : null;
        case 'CHECKLIST_ITEM_TOGGLED':
          return meta?.text ? by(t(meta?.isCompleted ? 'job.activity.ticked' : 'job.activity.unticked', { text: String(meta.text) })) : null;
        default: return null; // Comments are drawn as themselves; the rest is office bookkeeping.
      }
    };
    const out: Row[] = comments.map((cm) => ({
      kind: 'comment', id: cm.id, at: cm.createdAt,
      first: cm.user?.firstName ?? '', last: cm.user?.lastName ?? '',
      text: cm.content, pending: !!cm.pendingSync,
    }));
    if (events) {
      for (const e of events) {
        const text = describe(e.eventType, e.metadata, name(e.user));
        if (text) out.push({ kind: 'event', id: e.id, at: e.createdAt, text, pending: false });
      }
    } else {
      out.push({ kind: 'event', id: 'created', at: created.at, text: describe('CREATED', undefined, name(created.by)) ?? '', pending: false });
    }
    // Steps taken here this session that the timeline does not hold yet.
    const since = events?.reduce((m, e) => Math.max(m, new Date(e.createdAt).getTime()), 0) ?? 0;
    for (const e of localEvents) {
      if (new Date(e.createdAt).getTime() <= since) continue;
      const text = describe(e.eventType, e.metadata, '');
      if (text) out.push({ kind: 'event', id: e.id, at: e.createdAt, text, pending: !!e.pendingSync });
    }
    return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [comments, events, localEvents, created.at, created.by, labelOf, t]);

  const at = (iso: string) => `${formatDateRelative(iso, null)} ${formatTime(iso, null)}`;
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    if (await onSend(text)) setDraft('');
  };

  return (
    <View onLayout={onLayout} style={{ gap: amazen.space(3) }}>
      <SectionLabel>{t('job.activity.title')}</SectionLabel>
      {rows.length === 0 ? <AText variant="caption" tone="ink">{t('job.activity.empty')}</AText> : null}
      {rows.map((r) => r.kind === 'comment' ? (
        <View key={r.id} style={{ flexDirection: 'row', gap: amazen.space(2.5) }}>
          <Initials first={r.first} last={r.last} />
          <View style={{ flex: 1, gap: 1 }}>
            <AText variant="caption" tone="ink" numberOfLines={1}>
              <AText variant="caption" tone="strong" style={{ fontFamily: amazen.font.sansMedium }}>{`${r.first} ${r.last}`.trim()}</AText>
              {` · ${at(r.at)}${r.pending ? ` · ${t('job.activity.waiting')}` : ''}`}
            </AText>
            <AText variant="body" tone="strong" style={{ fontSize: 14, lineHeight: 20 }}>{r.text}</AText>
          </View>
        </View>
      ) : (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2.5) }}>
          <View style={{ width: 30, alignItems: 'center' }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.inkMuted }} />
          </View>
          <AText variant="caption" tone="muted" numberOfLines={3} style={{ flex: 1 }}>
            {`${r.text} · ${at(r.at)}${r.pending ? ` · ${t('job.activity.waiting')}` : ''}`}
          </AText>
        </View>
      ))}
      {canWrite ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: amazen.space(2) }}>
          <JobField
            value={draft}
            onChangeText={setDraft}
            placeholder={visitNotes ? t('job.activity.visitPlaceholder') : t('job.activity.placeholder')}
            multiline
            maxLength={500}
            style={{ flex: 1, borderRadius: 22, minHeight: 46, maxHeight: 140, paddingTop: 12 }}
          />
          <RoundButton Glyph={SendGlyph} label={t('job.activity.send')} tone="jade" onPress={() => void send()} disabled={busy || !draft.trim()} />
        </View>
      ) : null}
    </View>
  );
}
