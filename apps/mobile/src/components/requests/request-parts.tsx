import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LEAVE_TYPES, formatDuration, personName, type LeaveType, type RequestKind } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import type { TimeOffRequest } from '../../lib/api';
import { SyncChip } from '../../offline/components/sync-chip';
import { AText, PrimaryButton, Sunken } from '../amazen';
import { JobSheet, Pill, ReceiptRow, SheetOption, StateEyebrow, type Tone } from '../job/job-ui';
import { LeaveTypeMark, REQUEST_KIND_GLYPH, RequestKindGlyph } from './request-glyphs';
import { describeRequest, hoursFact, kindEffectKey, kindHintKey, kindLabelKey, leaveTypeLabelKey, leaveTypeMarkKey, legacyLabelMap } from './request-model';

/** A request as the parts below read it: the server's row, or one still on the phone. */
export type RequestRowData = TimeOffRequest & { pendingSync?: boolean };

/** A day `YYYY-MM-DD…` at noon, local — never shifted across midnight by a zone. */
const noon = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`);

/**
 * THE WORDS OF A REQUEST — what it is called, its days, where, and how long.
 *
 * One reader for every screen that lists requests (the Requests tab, the Time
 * tab, the manager's queue), so a remote day reads the same in all three.
 */
export function useRequestWords() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  // Old rows carry the leave type in the reason, in whichever language the phone spoke (request-model.ts).
  const legacy = useMemo(
    () => legacyLabelMap(LEAVE_TYPES.flatMap((ty) => [[ty, t(leaveTypeLabelKey(ty))], [ty, t(leaveTypeLabelKey(ty), { lng: 'en' })]] as const)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );
  return useMemo(() => {
    const day = (d: string) => noon(d).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });
    const range = (a: string, b: string) => (a.slice(0, 10) === b.slice(0, 10) ? day(a) : `${day(a)} – ${day(b)}`);
    const describe = (r: RequestRowData) => {
      const d = describeRequest(r, legacy);
      return { ...d, title: t(d.titleKey) };
    };
    /** Where and how much — the workspace, the changed hours, the agreed minutes. */
    const details = (r: RequestRowData, spaceName?: string | null): Array<{ label: string; value: string }> => {
      const out: Array<{ label: string; value: string }> = [];
      const space = r.space?.name ?? spaceName;
      if (space) out.push({ label: t('requests.form.workspace', 'Workspace'), value: space });
      const kind = describeRequest(r).kind;
      if (kind === 'HOURS') {
        const f = hoursFact(r.startTime, r.endTime);
        if (f) out.push({ label: t('requests.form.hours', 'Hours'), value: t(f.key, f.values) });
      }
      if (kind === 'OVERTIME' && r.minutes) out.push({ label: t('requests.form.howLong', 'How long'), value: t('requests.facts.overtime', { duration: formatDuration(r.minutes) }) });
      return out;
    };
    const status = (r: RequestRowData): { label: string; tone: Tone } =>
      r.status === 'APPROVED' ? { label: t('timeOffStatus.APPROVED'), tone: 'accent' }
        : r.status === 'REJECTED' ? { label: t('timeOffStatus.REJECTED'), tone: 'critical' }
          : r.status === 'CANCELED' ? { label: t('timeOffStatus.CANCELED'), tone: 'neutral' }
            : { label: t('timeOffStatus.PENDING'), tone: 'warn' };
    return { day, range, describe, details, status };
  }, [lang, legacy, t]);
}

/** One request in a list: its mark, what it is, when and where, and its state. */
export function RequestRow({
  request,
  spaceName,
  onPress,
}: {
  request: RequestRowData;
  /** The workspace's name when the row only carries its id (a request still on the phone). */
  spaceName?: string | null;
  onPress?: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const w = useRequestWords();
  const d = w.describe(request);
  const s = w.status(request);
  const sub = [w.range(request.startDate, request.endDate), ...w.details(request, spaceName).map((x) => x.value)].join(' · ');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${d.title}, ${sub}, ${s.label}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.5), opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center' }}>
        <RequestKindGlyph kind={d.kind} size={20} color={c.inkStrong} contrast={c.tile} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14.5, lineHeight: 20 }}>{d.title}</AText>
        <AText variant="caption" tone="muted" numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 17 }}>{sub}</AText>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <SyncChip entityId={request.id} />
        {request.pendingSync ? null : <Pill label={s.label} tone={s.tone} />}
      </View>
    </Pressable>
  );
}

/**
 * NEW REQUEST — the first question is WHAT is asked. Only the kinds the server
 * offered are shown (REMOTE only to somebody allowed to work away from a site).
 */
export function KindChooserSheet({
  visible,
  kinds,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** Null while the options are being read. */
  kinds: readonly RequestKind[] | null;
  onPick: (kind: RequestKind) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <JobSheet visible={visible} onClose={onClose} title={t('requests.chooseTitle', 'What are you asking for?')}>
      {kinds === null ? (
        <AText variant="caption" tone="muted">{t('common.loading', 'Loading…')}</AText>
      ) : (
        kinds.map((k) => (
          <SheetOption key={k} label={t(kindLabelKey(k))} hint={t(kindHintKey(k))} Glyph={REQUEST_KIND_GLYPH[k]} onPress={() => onPick(k)} />
        ))
      )}
      <AText variant="caption" tone="muted" style={{ fontSize: 12, textAlign: 'center' }}>{t('requests.chooseNote', 'What you can ask for depends on your workspace and your permissions.')}</AText>
    </JobSheet>
  );
}

/**
 * A request, opened: what it is, its days and details, its note, its answer —
 * and, while it waits and has reached the office, Withdraw.
 */
export function RequestDetailSheet({
  request,
  spaceName,
  onClose,
  onWithdraw,
}: {
  request: RequestRowData | null;
  spaceName?: string | null;
  onClose: () => void;
  onWithdraw?: (r: RequestRowData) => Promise<void>;
}) {
  const { amazen } = useTheme();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const w = useRequestWords();
  const [busy, setBusy] = useState(false);
  if (!request) return <JobSheet visible={false} onClose={onClose}><View /></JobSheet>;
  const d = w.describe(request);
  const s = w.status(request);
  const waiting = request.status === 'PENDING';
  const who = request.approvedBy ? personName(request.approvedBy) : null;
  const effect = waiting ? kindEffectKey(d.kind) : null;

  const withdraw = async () => {
    if (!onWithdraw) return;
    setBusy(true);
    try {
      await onWithdraw(request);
      onClose();
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('timeOff.failedToCancel'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <JobSheet
      visible
      onClose={onClose}
      busy={busy}
      eyebrow={<StateEyebrow tone={s.tone === 'neutral' ? 'muted' : s.tone} label={request.pendingSync ? t('offline.chip.waiting') : who && request.status === 'APPROVED' ? t('time.off.approvedBy', { defaultValue: 'Approved by {{name}}', name: who }) : s.label} />}
      title={d.title}
    >
      <Sunken style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
        <ReceiptRow label={request.startDate.slice(0, 10) === request.endDate.slice(0, 10) ? t('requests.form.day', 'Day') : t('requests.form.days', 'Days')} value={w.range(request.startDate, request.endDate)} />
        {w.details(request, spaceName).map((x) => <ReceiptRow key={x.label} label={x.label} value={x.value} />)}
        {request.createdAt ? <ReceiptRow label={t('time.off.sentAt', 'Sent')} value={new Date(request.createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} /> : null}
      </Sunken>
      {d.note ? <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>{d.note}</AText> : null}
      {request.rejectionReason ? <AText variant="body" tone="critical" style={{ fontSize: 14, lineHeight: 21 }}>{request.rejectionReason}</AText> : null}
      {effect ? <AText variant="caption" tone="muted" style={{ fontSize: 12.5 }}>{t(effect)}</AText> : null}
      <PrimaryButton label={t('common.done', 'Done')} onPress={onClose} />
      {waiting && !request.pendingSync && onWithdraw ? (
        <Pressable onPress={() => void withdraw()} disabled={busy} accessibilityRole="button" style={{ alignSelf: 'center', padding: amazen.space(2) }}>
          <AText variant="body" tone="critical" style={{ fontSize: 14 }}>{t('time.off.withdraw', 'Withdraw the request')}</AText>
        </Pressable>
      ) : null}
    </JobSheet>
  );
}

/**
 * WHICH KIND OF LEAVE — four tiles, a mark over each word. The Requests tab's
 * leave form and the Time tab's request sheet both ask with this.
 */
export function LeaveTypePicker({ value, onChange }: { value: LeaveType; onChange: (t: LeaveType) => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', gap: amazen.space(1.5) }}>
      {LEAVE_TYPES.map((k) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: amazen.space(2.5), borderRadius: 16, backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1, borderColor: on ? c.accent : 'transparent' }}
          >
            <LeaveTypeMark kind={leaveTypeMarkKey(k)} color={on ? c.accent : c.inkMuted} />
            <AText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 12.5, color: on ? c.inkStrong : c.ink }}>{t(`time.off.kind.${leaveTypeMarkKey(k)}`)}</AText>
          </Pressable>
        );
      })}
    </View>
  );
}
