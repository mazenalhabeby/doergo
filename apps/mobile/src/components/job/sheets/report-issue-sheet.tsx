import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PickedImage } from '../../../hooks/useImagePicker';
import { AText, PrimaryButton } from '../../amazen';
import { Banner, ChoiceRow, JobField, JobSheet, SectionLabel } from '../job-ui';
import { PhotoPicks, usePhotoPicks } from '../photo-picks';
import { issueReason, type Severity } from '../job-logic';

const SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const MAX_PHOTOS = 3;

/**
 * Report an issue on a job — what is stopping you, how badly, a note and a
 * photo. It moves the job to the workflow's Blocked step with the reason, so
 * the office reads it on the job and the job reads Blocked everywhere.
 *
 * ⚠️ The words are the shift issue sheet's (`issues.*`): one vocabulary for
 * "something is stopping me", whichever screen it is said from.
 */
export function ReportIssueSheet({
  visible,
  onClose,
  context,
  busy,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  /** "Replace valve · BILLA AG" — what travels with the report, said before they type. */
  context: string;
  busy: boolean;
  onSend: (reason: string, photos: PickedImage[]) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const picks = usePhotoPicks(MAX_PHOTOS, 'issue-photo');
  const [what, setWhat] = useState('');
  const [severity, setSeverity] = useState<Severity>('MEDIUM');
  const [note, setNote] = useState('');

  const { reset } = picks;
  useEffect(() => {
    if (!visible) return;
    setWhat(''); setSeverity('MEDIUM'); setNote(''); reset();
  }, [visible, reset]);

  const send = async () => {
    const reason = issueReason(what, t(`issues.severity.${severity}`), note);
    if (await onSend(reason, picks.photos)) onClose();
  };

  return (
    <JobSheet visible={visible} onClose={onClose} title={t('job.issue.title')} busy={busy}>
      <Banner tone="neutral" text={t('job.issue.context', { context })} />
      <JobField value={what} onChangeText={setWhat} placeholder={t('issues.titlePlaceholder')} maxLength={160} />
      <SectionLabel>{t('issues.howBadly')}</SectionLabel>
      <ChoiceRow options={SEVERITIES.map((k) => ({ key: k, label: t(`issues.severity.${k}`) }))} value={severity} onChange={setSeverity} />
      <JobField value={note} onChangeText={setNote} placeholder={t('issues.descriptionPlaceholder')} multiline maxLength={600} />
      <PhotoPicks picks={picks} addLabel={t('issues.addPhoto')} />
      <PrimaryButton label={t('issues.send')} onPress={() => void send()} disabled={!what.trim()} loading={busy} />
      <View>
        <AText variant="caption" tone="ink" style={{ textAlign: 'center' }}>{t('issues.sendHint')}</AText>
      </View>
    </JobSheet>
  );
}
