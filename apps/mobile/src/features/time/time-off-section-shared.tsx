import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { AText, ReceiptRow } from '@/components/amazen';
import { DateTileRow } from './date-tile-row';
import { dayKey, dayOf, daysOff } from './time-logic';
import type { MyTimeOffRequest } from './use-my-time-off';
import { personName } from '@hbcfield/shared/client';
import { useRequestWords } from '../requests/request-parts';

/** What the components of time-off-section.tsx share (moved here unchanged). */
export function useRangeText() {
  const { i18n } = useTranslation();
  return (a: Date, b: Date) => {
    const f = (d: Date) => d.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
    return dayKey(a) === dayKey(b) ? f(a) : `${f(a)} – ${f(b)}`;
  };
}

export function LeaveRow({ request, weekdays, onPress }: { request: MyTimeOffRequest; weekdays: Set<number> | null; onPress: () => void }) {
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

export function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {swatch}
      <AText variant="caption" tone="muted" style={{ fontSize: 10.5 }}>{label}</AText>
    </View>
  );
}

/**
 * The key under a leave calendar: approved, waiting, and (when the person has working days) the
 * dimmed "7" for a day off. Labels and the off-day dimming are the caller's — the Time tab's
 * sheet and the time-off calendar word and dim them differently.
 */
export function LeaveLegend({
  amazen,
  approved,
  waiting,
  off,
  offOpacity,
}: {
  amazen: ReturnType<typeof useTheme>['amazen'];
  approved: string;
  waiting: string;
  /** null = no off-day entry. */
  off: string | null;
  offOpacity: number;
}) {
  const c = amazen.color;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(3), alignItems: 'center' }}>
      <Legend
        swatch={
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 3,
              backgroundColor: c.accentTint,
              borderWidth: 1,
              borderColor: c.accent,
            }}
          />
        }
        label={approved}
      />
      <Legend
        swatch={<View style={{ width: 9, height: 9, borderRadius: 3, borderWidth: 1.5, borderColor: c.warn }} />}
        label={waiting}
      />
      {off !== null ? (
        <Legend
          swatch={
            <AText variant="caption" tone="muted" style={{ fontSize: 10, opacity: offOpacity }}>
              7
            </AText>
          }
          label={off}
        />
      ) : null}
    </View>
  );
}

/** A receipt line; the strong one (the total) is ruled off above. */
export function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
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
