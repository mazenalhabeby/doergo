import React from 'react';
import { useTranslation } from 'react-i18next';
import { AText, PrimaryButton, QuietButton } from '../../../components/amazen';
import { JobSheet } from '../job-ui';

/**
 * "You're not clocked in" — asked when a step would start work and the member
 * is off the clock (rule: packages/shared/src/tasks/clock-gate.ts).
 *
 * Never a dead end: one tap clocks them in through the same flow as the home
 * card (location, the workspace choice, the geofence), and the job moves on as
 * soon as the clock-in lands. "Not now" leaves the job where it was.
 */
export function ClockInToStartSheet({
  visible,
  onClose,
  jobTitle,
  busy,
  onClockIn,
}: {
  visible: boolean;
  onClose: () => void;
  /** "Heating check · Müller" — so they know which job is waiting. */
  jobTitle: string;
  busy: boolean;
  onClockIn: () => void;
}) {
  const { t } = useTranslation();
  return (
    <JobSheet visible={visible} onClose={onClose} title={t('job.clockGate.title')} eyebrow={jobTitle} busy={busy}>
      <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 20 }}>{t('job.clockGate.body')}</AText>
      <PrimaryButton label={t('job.clockGate.clockInAndStart')} onPress={onClockIn} loading={busy} disabled={busy} />
      <QuietButton label={t('job.clockGate.notNow')} onPress={onClose} disabled={busy} />
    </JobSheet>
  );
}
