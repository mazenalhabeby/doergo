/** DetailSheet from time-off-section.tsx — moved here unchanged (2026-10-17 line-length split). */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { AText, PrimaryButton, Sunken } from '../amazen';
import { JobSheet, StateEyebrow } from '../job/job-ui';
import { dayOf, daysOff } from './time-logic';
import type { useMyTimeOff, MyTimeOffRequest } from './use-my-time-off';
import { personName } from '@hbcfield/shared/client';
import { useRequestWords } from '../requests/request-parts';
import { Line } from './time-off-section-shared';

/** A request, opened: its days, its state, and — while it waits — Withdraw. */
export function DetailSheet({
  request,
  onClose,
  leave,
  weekdays,
}: {
  request: MyTimeOffRequest | null;
  onClose: () => void;
  leave: ReturnType<typeof useMyTimeOff>;
  weekdays: Set<number> | null;
}) {
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
        toast.error(
          t('common.error'),
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
            outcome.message ||
            t('timeOff.failedToCancel'),
        );
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
      eyebrow={
        <StateEyebrow
          tone={waiting ? 'warn' : 'accent'}
          label={
            waiting
              ? t('time.off.waiting', 'Waiting for approval')
              : who
                ? t('time.off.approvedBy', { defaultValue: 'Approved by {{name}}', name: who })
                : t('time.off.approved', 'Approved')
          }
        />
      }
      title={described.title}
    >
      <Sunken style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
        <Line label={t('time.off.from', 'From')} value={f(a)} />
        <Line label={t('time.off.to', 'To')} value={f(b)} />
        <Line
          strong
          label={weekdays ? t('time.off.workingDaysLabel', 'Working days') : t('time.off.daysLabel', 'Days')}
          value={String(daysOff(a, b, weekdays))}
        />
        {request.createdAt ? (
          <Line
            label={t('time.off.sentAt', 'Sent')}
            value={new Date(request.createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}
          />
        ) : null}
      </Sunken>
      {note ? <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 21 }}>{note}</AText> : null}
      <PrimaryButton label={t('common.done', 'Done')} onPress={onClose} />
      {waiting && !request.pendingSync ? (
        <Pressable
          onPress={() => void withdraw()}
          disabled={busy}
          accessibilityRole="button"
          style={{ alignSelf: 'center', padding: amazen.space(2) }}>
          <AText variant="body" tone="critical" style={{ fontSize: 14 }}>{t('time.off.withdraw', 'Withdraw the request')}</AText>
        </Pressable>
      ) : null}
    </JobSheet>
  );
}
