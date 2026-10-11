import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { AText, PrimaryButton, Sunken, Well, WellDivider } from '../amazen';
import { JobField, JobSheet, QuietButton, ReceiptRow, SectionLabel, StateEyebrow } from '../job/job-ui';
import { PlusGlyph } from '../job/job-glyphs';
import { DateTileRow } from './date-tile-row';
import {
  addDays, dayKey, dayOf, daysOff, leaveDays, monthGrid, overlapIn, upcomingLeave, usedThisYear, workWeekdays,
} from './time-logic';
import type { useMyTimeOff, MyTimeOffRequest } from './use-my-time-off';
import { personName, type LeaveType } from '@hbcfield/shared/client';
import { LeaveTypePicker, useRequestWords } from '../requests/request-parts';
import { draftToBody, leaveTypeLabelKey } from '../requests/request-model';
import { useLeaveCost } from '../requests/use-leave-preview';

/**
 * TIME OFF, ON THE TIME TAB — what is coming up, and one button to ask.
 *
 * The full history and the calendar of the whole year stay on the Time off
 * tab; this is the everyday question — "am I off soon, and did they say yes?"
 * — and the everyday act.
 */
export function TimeOffSection({
  leave,
  requestOpen,
  setRequestOpen,
  now,
}: {
  leave: ReturnType<typeof useMyTimeOff>;
  requestOpen: boolean;
  setRequestOpen: (v: boolean) => void;
  now: Date;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const [detail, setDetail] = useState<MyTimeOffRequest | null>(null);
  const weekdays = useMemo(() => workWeekdays(leave.schedule), [leave.schedule]);
  // ⚠️ LEAVE only — a remote day or agreed overtime is a day worked, never "time off coming up".
  const ahead = useMemo(() => upcomingLeave(leave.absences, now).slice(0, 3), [leave.absences, now]);
  const used = useMemo(() => usedThisYear(leave.absences, weekdays, now), [leave.absences, weekdays, now]);

  return (
    <Well style={{ padding: amazen.space(3.5), gap: amazen.space(1) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: amazen.space(1) }}>
        <SectionLabel>{t('time.off.title', 'Time off')}</SectionLabel>
        <AText variant="caption" tone="muted" numeric>{t('time.off.used', { count: used, defaultValue: '{{count}} days used this year' })}</AText>
      </View>

      {ahead.length === 0 ? (
        <AText variant="caption" tone="muted" style={{ paddingVertical: amazen.space(1.5) }}>{t('time.off.none', 'No time off coming up.')}</AText>
      ) : (
        ahead.map((r, i) => (
          <React.Fragment key={r.id}>
            {i > 0 ? <WellDivider /> : null}
            <LeaveRow request={r} weekdays={weekdays} onPress={() => setDetail(r)} />
          </React.Fragment>
        ))
      )}

      <Pressable
        onPress={() => setRequestOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => ({
          marginTop: amazen.space(2), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: amazen.space(2),
          minHeight: amazen.layout.tapMin, borderRadius: amazen.radius.full, backgroundColor: c.accentTint,
          borderWidth: 1, borderColor: c.accent, opacity: pressed ? 0.85 : 1,
        })}
      >
        <PlusGlyph size={16} color={c.accent} />
        <AText variant="body" tone="accent" style={{ fontSize: 14.5 }}>{t('time.off.request', 'Request time off')}</AText>
      </Pressable>

      <RequestSheet visible={requestOpen} onClose={() => setRequestOpen(false)} leave={leave} weekdays={weekdays} now={now} />
      <DetailSheet request={detail} onClose={() => setDetail(null)} leave={leave} weekdays={weekdays} />
    </Well>
  );
}

function useRangeText() {
  const { i18n } = useTranslation();
  return (a: Date, b: Date) => {
    const f = (d: Date) => d.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
    return dayKey(a) === dayKey(b) ? f(a) : `${f(a)} – ${f(b)}`;
  };
}

function LeaveRow({ request, weekdays, onPress }: { request: MyTimeOffRequest; weekdays: Set<number> | null; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const range = useRangeText();
  const words = useRequestWords();
  const a = dayOf(request.startDate);
  const b = dayOf(request.endDate);
  const n = daysOff(a, b, weekdays);
  const approved = request.status === 'APPROVED';
  const who = request.approvedBy ? personName(request.approvedBy) : null;
  return (
    <DateTileRow
      onPress={onPress}
      tileTop={a.getDate()}
      tileBottom={a.toLocaleDateString(i18n.language, { month: 'short' })}
      trailing={<AText variant="body" tone="muted">›</AText>}
    >
      <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14, lineHeight: 20 }}>
        {[words.describe(request).title, range(a, b)].join(' · ')}
      </AText>
      <AText variant="caption" numberOfLines={1} style={{ color: approved ? c.accent : c.warn }}>
        {request.pendingSync
          ? t('offline.chip.waiting')
          : approved
            ? (who ? t('time.off.approvedBy', { defaultValue: 'Approved by {{name}}', name: who }) : t('time.off.approved', 'Approved'))
            : t('time.off.waiting', 'Waiting for approval')}
        {` · ${t('time.off.days', { count: n, defaultValue: '{{count}} days' })}`}
      </AText>
    </DateTileRow>
  );
}

/**
 * ASKING FOR DAYS OFF — one sheet: what kind, which days, send.
 *
 * ⚠️ NO "HOW MANY PEOPLE ARE IN" HERE. Staffing levels are gated on
 * `canViewSpaceAttendance` on the server (`/employees/cover-range`), and a
 * member asking for leave does not hold it. The person who decides sees the
 * cover; the person asking sees their own days.
 *
 * ⚠️ THE DAYS COUNTED ARE ROTA DAYS WHEN THE ROTA IS KNOWN — a Friday-to-
 * Monday request is two days off for somebody who does not work weekends —
 * and calendar days when it is not, because an unknown rota is not an empty one.
 */
function RequestSheet({ visible, onClose, leave, weekdays, now }: { visible: boolean; onClose: () => void; leave: ReturnType<typeof useMyTimeOff>; weekdays: Set<number> | null; now: Date }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const range = useRangeText();
  const [kind, setKind] = useState<LeaveType>('VACATION');
  const [a, setA] = useState<Date | null>(null);
  const [b, setB] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ a: Date; b: Date; n: number; queued: boolean } | null>(null);
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const taken = useMemo(() => leaveDays(leave.absences), [leave.absences]);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const reset = () => { setA(null); setB(null); setNote(''); setNoteOpen(false); setSent(null); setKind('VACATION'); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); };
  const close = () => { onClose(); setTimeout(reset, 300); };

  const works = (d: Date) => !weekdays || weekdays.has(d.getDay());
  const pick = (d: Date) => {
    if (taken.has(dayKey(d))) return;
    if (!a || b || d < a) { setA(d); setB(null); return; }
    setB(dayKey(d) === dayKey(a) ? null : d);
  };
  /** The next day this member works, from `from` on. */
  const nextWorking = (from: Date) => { let d = from; for (let i = 0; i < 14 && !works(d); i++) d = addDays(d, 1); return d; };
  const quick = (k: 'tomorrow' | 'nextWeek') => {
    if (k === 'tomorrow') { const d = nextWorking(addDays(today, 1)); setA(d); setB(null); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); return; }
    const monday = addDays(today, 7 - ((today.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter(works);
    const first = days[0] ?? monday;
    const last = days[days.length - 1] ?? addDays(monday, 4);
    setA(first); setB(dayKey(last) === dayKey(first) ? null : last);
    setMonth(new Date(first.getFullYear(), first.getMonth(), 1));
  };

  const end = b ?? a;
  /*
    What the range COSTS, asked of the server — the one count the request is charged by: the
    workspace's weekend, public holidays and the member's own rota (shared calendar/days.ts).
    Offline, the phone's own count from the working week stands in.
  */
  const { user } = useAuth();
  const cost = useLeaveCost(user?.id, a ? dayKey(a) : null, end ? dayKey(end) : null);
  const costDay = useMemo(() => new Map((cost?.days ?? []).map((d) => [d.day, d])), [cost]);
  const n = cost ? cost.counted : a && end ? daysOff(a, end, weekdays) : 0;
  const clash = a && end ? overlapIn(a, end, taken) : null;
  const kindLabel = t(leaveTypeLabelKey(kind));

  const send = async () => {
    if (!a || !end || clash || busy) return;
    setBusy(true);
    try {
      // The leave type travels as `type`; the note is the note (request-model.ts).
      const built = draftToBody({ kind: 'LEAVE', startDate: dayKey(a), endDate: dayKey(end), type: kind, reason: note });
      if (!built.ok) { toast.error(t('common.error'), t(`offline.errors.${built.code}`)); return; }
      const outcome = await leave.request(built.body);
      if (outcome.kind === 'refused') {
        toast.error(t('common.error'), (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('timeOff.requestForm.failedToSubmit'));
        return;
      }
      setSent({ a, b: end, n, queued: outcome.kind === 'queued' });
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('timeOff.requestForm.failedToSubmit'));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <JobSheet visible={visible} onClose={close}>
        <View style={{ alignItems: 'center', gap: amazen.space(2), paddingTop: amazen.space(2) }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={30} height={30} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={c.accent} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </View>
          <AText variant="h2" tone="strong" style={{ fontFamily: amazen.font.sansLight }}>{sent.queued ? t('time.off.queuedTitle', 'Saved on your phone') : t('time.off.sentTitle', 'Request sent')}</AText>
          <AText variant="body" tone="ink" style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }}>
            {sent.queued ? t('time.off.queuedBody', 'It goes to the office as soon as you have signal.') : t('time.off.sentBody', 'You will get a notification when it is answered.')}
          </AText>
        </View>
        <Sunken style={{ padding: amazen.space(3.5), gap: amazen.space(1) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AText variant="caption" tone="muted" style={{ fontSize: 13.5 }}>{kindLabel}</AText>
            <AText variant="caption" tone="ink" numeric style={{ fontSize: 13.5 }}>{t('time.off.days', { count: sent.n, defaultValue: '{{count}} days' })}</AText>
          </View>
          <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>{range(sent.a, sent.b)}</AText>
        </Sunken>
        <PrimaryButton label={t('common.done', 'Done')} onPress={close} />
      </JobSheet>
    );
  }

  const grid = monthGrid(month.getFullYear(), month.getMonth());
  const canBack = month > new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return (
    <JobSheet visible={visible} onClose={close} busy={busy} title={t('time.off.requestTitle', 'Request time off')}>
      <LeaveTypePicker value={kind} onChange={setKind} />

      <View style={{ flexDirection: 'row', gap: amazen.space(1.5) }}>
        {(['tomorrow', 'nextWeek'] as const).map((k) => (
          <Pressable key={k} onPress={() => quick(k)} accessibilityRole="button" style={({ pressed }) => ({ borderRadius: amazen.radius.full, paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(1.75), backgroundColor: c.tile, opacity: pressed ? 0.75 : 1 })}>
            <AText variant="caption" tone="ink" style={{ fontSize: 13 }}>{t(`time.off.quick.${k}`)}</AText>
          </Pressable>
        ))}
      </View>

      <Sunken style={{ padding: amazen.space(3), gap: amazen.space(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable disabled={!canBack} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('time.off.prevMonth', 'Previous month')} style={{ opacity: canBack ? 1 : 0.3, paddingHorizontal: amazen.space(2) }}>
            <AText variant="body" tone="strong">‹</AText>
          </Pressable>
          <AText variant="body" tone="strong" style={{ flex: 1, textAlign: 'center', fontSize: 14.5 }}>
            {month.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })}
          </AText>
          <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('time.off.nextMonth', 'Next month')} style={{ paddingHorizontal: amazen.space(2) }}>
            <AText variant="body" tone="strong">›</AText>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row' }}>
          {grid.slice(0, 7).map((d) => (
            <AText key={d.getDay()} variant="caption" tone="muted" numeric style={{ flex: 1, textAlign: 'center', fontSize: 10.5 }}>
              {d.toLocaleDateString(i18n.language, { weekday: 'narrow' })}
            </AText>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {grid.map((d) => {
            const k = dayKey(d);
            const inMonth = d.getMonth() === month.getMonth();
            const mark = taken.get(k);
            const inRange = !!a && !!end && d >= a && d <= end;
            const edge = !!a && (k === dayKey(a) || (!!end && k === dayKey(end)));
            const known = costDay.get(k);
            const holiday = known?.kind === 'holiday' || known?.kind === 'half-holiday';
            const off = known ? known.cost === 0 : !works(d);
            return (
              <View key={k} style={{ width: `${100 / 7}%`, padding: 1.5 }}>
                <Pressable
                  onPress={() => pick(d)}
                  disabled={!!mark}
                  accessibilityRole="button"
                  accessibilityState={{ selected: inRange, disabled: !!mark }}
                  accessibilityLabel={d.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                  style={{
                    height: 38, borderRadius: edge ? 12 : 8, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: edge ? c.accentSolid : inRange ? c.accentTint : mark === 'approved' ? c.accentTint : 'transparent',
                    borderWidth: mark === 'pending' ? 1.5 : 0, borderColor: c.warn,
                    opacity: inMonth ? 1 : 0.35,
                  }}
                >
                  <AText
                    variant="caption"
                    numeric
                    style={{
                      fontSize: 13.5,
                      color: edge ? c.accentInk : holiday ? c.critical : mark === 'approved' ? c.accent : off ? c.inkMuted : dayKey(d) === dayKey(today) ? c.accent : c.inkStrong,
                      opacity: off && !edge && !holiday ? 0.55 : 1,
                      textDecorationLine: inRange && (off || holiday) && !edge ? 'line-through' : 'none',
                    }}
                  >
                    {d.getDate()}
                  </AText>
                </Pressable>
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(3), alignItems: 'center' }}>
          <Legend swatch={<View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c.accentTint, borderWidth: 1, borderColor: c.accent }} />} label={t('time.off.legendApproved', 'Approved')} />
          <Legend swatch={<View style={{ width: 9, height: 9, borderRadius: 3, borderWidth: 1.5, borderColor: c.warn }} />} label={t('time.off.legendWaiting', 'Waiting')} />
          {weekdays ? <Legend swatch={<AText variant="caption" tone="muted" style={{ fontSize: 10, opacity: 0.55 }}>7</AText>} label={t('time.off.legendOff', 'Not a working day')} /> : null}
        </View>
      </Sunken>

      <AText variant="caption" tone="muted" style={{ textAlign: 'center', marginTop: -amazen.space(1) }}>
        {!a ? t('time.off.hintFirst', 'Tap your first day off') : !b ? t('time.off.hintLast', 'Tap your last day, or send just this one') : ' '}
      </AText>

      {a && end ? (
        <Sunken style={{ paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(3.5), flexDirection: 'row', alignItems: 'center', gap: amazen.space(3) }}>
          <AText variant="body" tone="strong" style={{ flex: 1, fontSize: 14 }}>{range(a, end)}</AText>
          <AText variant="caption" tone="ink" numeric style={{ fontSize: 13 }}>
            {weekdays || (cost && cost.counted !== cost.calendarDays) ? t('time.off.workingDays', { count: n, defaultValue: '{{count}} working days' }) : t('time.off.days', { count: n, defaultValue: '{{count}} days' })}
          </AText>
        </Sunken>
      ) : null}
      {cost && (cost.restDays > 0 || cost.holidays.length > 0) ? (
        <AText variant="caption" tone="muted" style={{ textAlign: 'center', fontSize: 12, marginTop: -amazen.space(1) }}>
          {[
            cost.restDays > 0 ? t('time.off.restLeftOut', { count: cost.restDays, defaultValue: '{{count}} days off not counted' }) : null,
            ...cost.holidays.map((h) => h.name),
          ].filter(Boolean).join(' · ')}
        </AText>
      ) : null}

      {clash ? (
        <View style={{ borderRadius: 16, padding: amazen.space(3), backgroundColor: c.warnTint }}>
          <AText variant="caption" tone="warn" style={{ fontSize: 13, lineHeight: 18 }}>
            {t('time.off.clash', { defaultValue: 'You already have {{day}} off or asked for it. Choose days around it.', day: range(clash, clash) })}
          </AText>
        </View>
      ) : null}

      {noteOpen ? (
        <JobField value={note} onChangeText={setNote} placeholder={t('time.off.notePlaceholder', 'Anything the office should know (optional)')} multiline maxLength={500} autoFocus />
      ) : (
        <QuietButton label={`⊕  ${t('time.off.addNote', 'Add a note · optional')}`} onPress={() => setNoteOpen(true)} />
      )}

      <PrimaryButton
        label={a ? t('time.off.send', 'Send the request') : t('time.off.pickDays', 'Pick your days')}
        detail={a ? t('time.off.days', { count: n, defaultValue: '{{count}} days' }) : undefined}
        onPress={() => void send()}
        disabled={!a || !!clash || busy}
        loading={busy}
      />
    </JobSheet>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {swatch}
      <AText variant="caption" tone="muted" style={{ fontSize: 10.5 }}>{label}</AText>
    </View>
  );
}

/** A request, opened: its days, its state, and — while it waits — Withdraw. */
function DetailSheet({ request, onClose, leave, weekdays }: { request: MyTimeOffRequest | null; onClose: () => void; leave: ReturnType<typeof useMyTimeOff>; weekdays: Set<number> | null }) {
  const { amazen } = useTheme();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const words = useRequestWords();
  const [busy, setBusy] = useState(false);
  if (!request) return <JobSheet visible={false} onClose={onClose}><View /></JobSheet>;
  const a = dayOf(request.startDate);
  const b = dayOf(request.endDate);
  const waiting = request.status === 'PENDING';
  const who = request.approvedBy ? personName(request.approvedBy) : null;
  const f = (d: Date) => d.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const described = words.describe(request);
  const note = described.note;

  const withdraw = async () => {
    setBusy(true);
    try {
      const outcome = await leave.cancel(request.id);
      if (outcome.kind === 'refused') {
        toast.error(t('common.error'), (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) || outcome.message || t('timeOff.failedToCancel'));
        return;
      }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
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
      eyebrow={<StateEyebrow tone={waiting ? 'warn' : 'accent'} label={waiting ? t('time.off.waiting', 'Waiting for approval') : who ? t('time.off.approvedBy', { defaultValue: 'Approved by {{name}}', name: who }) : t('time.off.approved', 'Approved')} />}
      title={described.title}
    >
      <Sunken style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
        <Line label={t('time.off.from', 'From')} value={f(a)} />
        <Line label={t('time.off.to', 'To')} value={f(b)} />
        <Line strong label={weekdays ? t('time.off.workingDaysLabel', 'Working days') : t('time.off.daysLabel', 'Days')} value={String(daysOff(a, b, weekdays))} />
        {request.createdAt ? <Line label={t('time.off.sentAt', 'Sent')} value={new Date(request.createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} /> : null}
      </Sunken>
      {note ? <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>{note}</AText> : null}
      <PrimaryButton label={t('common.done', 'Done')} onPress={onClose} />
      {waiting && !request.pendingSync ? (
        <Pressable onPress={() => void withdraw()} disabled={busy} accessibilityRole="button" style={{ alignSelf: 'center', padding: amazen.space(2) }}>
          <AText variant="body" tone="critical" style={{ fontSize: 14 }}>{t('time.off.withdraw', 'Withdraw the request')}</AText>
        </Pressable>
      ) : null}
    </JobSheet>
  );
}

/** A receipt line; the strong one (the total) is ruled off above. */
function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { amazen } = useTheme();
  return (
    <ReceiptRow
      label={label}
      value={value}
      strong={strong}
      style={{ borderTopWidth: strong ? 1 : 0, borderTopColor: amazen.color.lineWell, paddingTop: strong ? amazen.space(2) : 0 }}
    />
  );
}
