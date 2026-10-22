import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { LeaveType } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { AText, PrimaryButton, Sunken, Well, JobField, QuietButton, ReceiptRow, SectionLabel } from '../../components/amazen';
import { LeaveTypePicker, useRequestWords } from '../requests/request-parts';
import { balancePreview, draftToBody } from '../requests/request-model';
import { PrecheckCard } from '../requests/precheck-card';
import { useRequestPrecheck } from '../requests/use-request-precheck';
import { useLeaveBalance, useLeaveCost } from '../requests/use-leave-preview';
import { LeaveBalanceCard } from '../requests/leave-balance-card';
import { toDateString } from './helpers';

/**
 * LEAVE FOR THE PICKED RANGE — which kind, what it costs, a note, Send.
 *
 * The cost is the server's count (weekend, holidays and the member's rota left
 * out); for VACATION the balance is shown line by line (LeaveBalanceCard)
 * with before and after, since only vacation is taken from it. Offline, the calendar days stand in and the
 * balance is simply left out — never a guessed number.
 */
export function TimeOffRequestForm({
  rangeStart,
  rangeEnd,
  rangeDays,
  leaveType,
  onLeaveType,
  notes,
  onNotes,
  isSubmitting,
  onClear,
  onSubmit,
}: {
  rangeStart: Date;
  rangeEnd: Date;
  /** The phone's own count, when the server's is not known. */
  rangeDays: number;
  leaveType: LeaveType;
  onLeaveType: (t: LeaveType) => void;
  notes: string;
  onNotes: (text: string) => void;
  isSubmitting: boolean;
  onClear: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const { amazen } = useTheme();
  const { user } = useAuth();
  const w = useRequestWords();
  const from = toDateString(rangeStart);
  const to = toDateString(rangeEnd);
  const cost = useLeaveCost(user?.id, from, to);
  const balance = useLeaveBalance(user?.id, leaveType === 'VACATION');
  const preview = balancePreview(balance, cost, leaveType);
  const days = cost ? cost.counted : rangeDays;
  // A current server sends the ledger lines: the card shows them and this request's before → after.
  const ledger = leaveType === 'VACATION' && !!balance?.lines;
  // What a leader would check: an overlap with your own requests, cover, a second approval.
  const built = draftToBody({ kind: 'LEAVE', startDate: from, endDate: to, type: leaveType, reason: '' });
  const precheck = useRequestPrecheck(built.ok ? (built.body as unknown as Record<string, unknown>) : null);

  return (
    <Well style={{ padding: amazen.space(4), gap: amazen.space(3) }}>
      <View style={{ gap: amazen.space(1) }}>
        <SectionLabel tone="accent">{t('timeOff.requestForm.title')}</SectionLabel>
        <AText variant="h2" tone="strong" style={{ fontFamily: amazen.font.sansLight }}>{w.range(from, to)}</AText>
      </View>

      <LeaveTypePicker value={leaveType} onChange={onLeaveType} />

      <Sunken style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
        <ReceiptRow
          label={cost ? t('time.off.workingDaysLabel', 'Working days') : t('time.off.daysLabel', 'Days')}
          value={String(days)}
        />
        {preview && !ledger ? (
          <ReceiptRow strong label={t('requests.balance', 'Balance')} value={`${preview.before} → ${preview.after}`} />
        ) : null}
        {cost && (cost.restDays > 0 || cost.holidays.length > 0) ? (
          <AText variant="caption" tone="muted" style={{ fontSize: 12 }}>
            {[
              cost.restDays > 0 ? t('time.off.restLeftOut', { count: cost.restDays }) : null,
              ...cost.holidays.map((h) => h.name),
            ].filter(Boolean).join(' · ')}
          </AText>
        ) : null}
      </Sunken>

      {ledger ? <LeaveBalanceCard balance={balance} preview={preview} requestDays={days} /> : null}

      <PrecheckCard precheck={precheck} kind="LEAVE" />

      <JobField
        value={notes}
        onChangeText={onNotes}
        placeholder={t('time.off.notePlaceholder', 'Anything the office should know (optional)')}
        multiline
        maxLength={500}
      />

      <PrimaryButton
        label={t('time.off.send', 'Send the request')}
        detail={t('time.off.days', { count: days })}
        onPress={onSubmit}
        disabled={isSubmitting}
        loading={isSubmitting}
      />
      <QuietButton label={t('timeOff.requestForm.clearSelection')} onPress={onClear} disabled={isSubmitting} />
    </Well>
  );
}
