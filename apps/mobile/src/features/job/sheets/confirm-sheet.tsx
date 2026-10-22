import React from 'react';
import { useTranslation } from 'react-i18next';
import { AText, QuietButton } from '@/components/amazen';
import { JobSheet } from '../job-ui';

/**
 * "Decline this job?", "Cancel this job?", "Delete this file?" — the one
 * confirmation shape on the job page. The destructive choice is red INK on a
 * quiet button, and "Keep it" sits under it, so the easy tap is the safe one.
 */
export function JobConfirmSheet({
  visible,
  onClose,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <JobSheet visible={visible} onClose={onClose} title={title} busy={busy}>
      <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 20 }}>{body}</AText>
      <QuietButton tone="critical" label={confirmLabel} onPress={onConfirm} disabled={busy} />
      <QuietButton label={t('job.keep')} onPress={onClose} disabled={busy} />
    </JobSheet>
  );
}
