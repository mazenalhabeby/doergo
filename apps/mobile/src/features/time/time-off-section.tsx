import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/island/island-context';
import { AText, PrimaryButton, Sunken, Well, WellDivider } from '@/components/amazen';
import { JobField, QuietButton, ReceiptRow, SectionLabel, StateEyebrow } from '@/components/amazen';
import { JobSheet } from '../job/job-ui';
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
import { useRangeText, LeaveRow, Legend, Line } from './time-off-section-shared';
import { useRequestSheet } from './use-request-sheet';
import { RequestSheetView } from './request-sheet-view';
import { RequestSheetOff } from './request-sheet-off';
import { DetailSheet } from './time-off-detail-sheet';

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
        <AText variant="caption" tone="muted" numeric>
          {t('time.off.used', { count: used, defaultValue: '{{count}} days used this year' })}
        </AText>
      </View>

      {ahead.length === 0 ? (
        <AText variant="caption" tone="muted" style={{ paddingVertical: amazen.space(1.5) }}>
          {t('time.off.none', 'No time off coming up.')}
        </AText>
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
export function RequestSheet({
  visible,
  onClose,
  leave,
  weekdays,
  now,
}: {
  visible: boolean;
  onClose: () => void;
  leave: ReturnType<typeof useMyTimeOff>;
  weekdays: Set<number> | null;
  now: Date;
}) {
  const vm = useRequestSheet({ visible, onClose, leave, weekdays, now });
  const {
    amazen,
    c,
    t,
    i18n,
    range,
    kind,
    setKind,
    a,
    b,
    note,
    setNote,
    noteOpen,
    setNoteOpen,
    busy,
    sent,
    month,
    setMonth,
    taken,
    today,
    close,
    works,
    pick,
    quick,
    end,
    cost,
    costDay,
    n,
    clash,
    kindLabel,
    send,
  } = vm;

  if (sent) {
    return (
      <JobSheet visible={visible} onClose={close}>
        <View style={{ alignItems: 'center', gap: amazen.space(2), paddingTop: amazen.space(2) }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: c.accentTint,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Svg width={30} height={30} viewBox="0 0 24 24">
              <Path
                d="M5 12.5l4.5 4.5L19 7.5"
                fill="none"
                stroke={c.accent}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
          <AText variant="h2" tone="strong" style={{ fontFamily: amazen.font.sansLight }}>
            {sent.queued ? t('time.off.queuedTitle', 'Saved on your phone') : t('time.off.sentTitle', 'Request sent')}
          </AText>
          <AText variant="body" tone="ink" style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }}>
            {sent.queued
              ? t('time.off.queuedBody', 'It goes to the office as soon as you have signal.')
              : t('time.off.sentBody', 'You will get a notification when it is answered.')}
          </AText>
        </View>
        <Sunken style={{ padding: amazen.space(3.5), gap: amazen.space(1) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AText variant="caption" tone="muted" style={{ fontSize: 13.5 }}>{kindLabel}</AText>
            <AText variant="caption" tone="ink" numeric style={{ fontSize: 13.5 }}>
              {t('time.off.days', { count: sent.n, defaultValue: '{{count}} days' })}
            </AText>
          </View>
          <AText variant="body" tone="strong" style={{ fontSize: 14.5 }}>{range(sent.a, sent.b)}</AText>
        </Sunken>
        <PrimaryButton label={t('common.done', 'Done')} onPress={close} />
      </JobSheet>
    );
  }

  const { grid, canBack } = RequestSheetView({ now, month });
  return (
    <JobSheet visible={visible} onClose={close} busy={busy} title={t('time.off.requestTitle', 'Request time off')}>
      <LeaveTypePicker value={kind} onChange={setKind} />

      <View style={{ flexDirection: 'row', gap: amazen.space(1.5) }}>
        {(['tomorrow', 'nextWeek'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => quick(k)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              borderRadius: amazen.radius.full,
              paddingHorizontal: amazen.space(3),
              paddingVertical: amazen.space(1.75),
              backgroundColor: c.tile,
              opacity: pressed ? 0.75 : 1,
            })}>
            <AText variant="caption" tone="ink" style={{ fontSize: 13 }}>{t(`time.off.quick.${k}`)}</AText>
          </Pressable>
        ))}
      </View>

      <RequestSheetOff vm={vm} canBack={canBack} grid={grid} weekdays={weekdays} />

      <AText variant="caption" tone="muted" style={{ textAlign: 'center', marginTop: -amazen.space(1) }}>
        {!a
          ? t('time.off.hintFirst', 'Tap your first day off')
          : !b
            ? t('time.off.hintLast', 'Tap your last day, or send just this one')
            : ' '}
      </AText>

      {a && end ? (
        <Sunken
          style={{
            paddingVertical: amazen.space(3),
            paddingHorizontal: amazen.space(3.5),
            flexDirection: 'row',
            alignItems: 'center',
            gap: amazen.space(3),
          }}>
          <AText variant="body" tone="strong" style={{ flex: 1, fontSize: 14 }}>{range(a, end)}</AText>
          <AText variant="caption" tone="ink" numeric style={{ fontSize: 13 }}>
            {weekdays || (cost && cost.counted !== cost.calendarDays)
              ? t('time.off.workingDays', { count: n, defaultValue: '{{count}} working days' })
              : t('time.off.days', { count: n, defaultValue: '{{count}} days' })}
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
            {t('time.off.clash', {
              defaultValue: 'You already have {{day}} off or asked for it. Choose days around it.',
              day: range(clash, clash),
            })}
          </AText>
        </View>
      ) : null}

      {noteOpen ? (
        <JobField
          value={note}
          onChangeText={setNote}
          placeholder={t('time.off.notePlaceholder', 'Anything the office should know (optional)')}
          multiline
          maxLength={500}
          autoFocus
        />
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
