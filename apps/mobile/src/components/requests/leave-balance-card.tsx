import { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localDateKey } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText, Sunken, WellDivider, ReceiptRow } from '../amazen';
import { balanceRows, carryNote, leaveYearLabel, signedDays, type MemberLeaveBalance } from '../../lib/leave-balance';

/** A day `YYYY-MM-DD` at noon, local — never shifted across midnight by a zone. */
const noon = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`);

/**
 * THE VACATION BALANCE, LINE BY LINE — what the member reads before sending.
 *
 * Allowance, used before HBCField, carried, expired, granted, corrected, taken,
 * = remaining; then what THIS request does to it ("3 working days · 14 → 11").
 * Every figure is the server's (shared leave-ledger.ts); nothing is added up
 * here. Renders nothing when the server sent no lines (an older server) — the
 * caller then keeps its single "Balance before → after" row.
 */
export function LeaveBalanceCard({
  balance,
  preview,
  requestDays,
}: {
  balance: MemberLeaveBalance | null;
  /** Before → after for this request, when its cost is known. */
  preview: { before: number; after: number } | null;
  /** What this request costs, in working days (the server's count, or the phone's). */
  requestDays: number;
}) {
  const { t, i18n } = useTranslation();
  const { amazen } = useTheme();
  const lang = i18n.language;
  const fmt = useMemo(() => {
    const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
    return (n: number) => nf.format(n);
  }, [lang]);
  const day = (k: string) => noon(k).toLocaleDateString(lang, { day: 'numeric', month: 'short' });

  const rows = balanceRows(balance, fmt);
  if (!balance || !rows) return null;
  const year = leaveYearLabel(balance, day);
  const carry = carryNote(balance, localDateKey(new Date()));

  return (
    <Sunken style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
      {year ? (
        <AText variant="caption" tone="muted" style={{ fontSize: 12 }}>{t(year.key, year.values)}</AText>
      ) : null}
      {rows.map((r) => (
        <ReceiptRow key={r.key} label={t(r.labelKey)} value={r.value} />
      ))}
      <WellDivider />
      <ReceiptRow strong label={t('requests.ledger.remaining', 'Remaining')} value={fmt(balance.remaining)} />
      {balance.pending > 0 ? (
        <ReceiptRow label={t('requests.ledger.pending', 'Waiting for an answer')} value={signedDays(-balance.pending, fmt)} />
      ) : null}
      {carry ? (
        <AText variant="caption" tone="muted" style={{ fontSize: 12 }}>
          {t('requests.ledger.carryExpires', { count: carry.count, days: fmt(carry.count), date: day(carry.date) })}
        </AText>
      ) : null}
      {preview ? (
        <View style={{ gap: amazen.space(2) }}>
          <WellDivider />
          <ReceiptRow
            strong
            label={t('requests.ledger.thisRequest', { count: requestDays, days: fmt(requestDays) })}
            value={`${fmt(preview.before)} → ${fmt(preview.after)}`}
          />
        </View>
      ) : null}
    </Sunken>
  );
}
