import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HANDOVER_NOTE_MAX, HANDOVER_PHOTOS_MAX } from '@hbcfield/shared/client';
import type { PickedImage } from '../../../hooks/useImagePicker';
import { PrimaryButton } from '../../amazen';
import { Banner, JobField, JobSheet, QuietButton } from '../job-ui';
import { PhotoPicks, usePhotoPicks } from '../photo-picks';

/**
 * "What you did, and what is left" — the handover of a job somebody stopped
 * (packages/shared/src/tasks/handover.ts). Whoever picks the job up next reads
 * it at the top of the job. Dictation is the keyboard's own microphone.
 */
export function HandoverSheet({
  visible,
  onClose,
  context,
  busy,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  /** "Heating check · Müller" — which job this is about. */
  context: string;
  busy: boolean;
  onSend: (note: string, photos: PickedImage[]) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const picks = usePhotoPicks(HANDOVER_PHOTOS_MAX, 'task-photo') // they go onto the job;
  const [note, setNote] = useState('');
  const { reset } = picks;
  useEffect(() => {
    if (!visible) return;
    setNote(''); reset();
  }, [visible, reset]);

  const send = async () => {
    if (await onSend(note.trim(), picks.photos)) onClose();
  };

  return (
    <JobSheet visible={visible} onClose={onClose} title={t('job.handover.title')} eyebrow={context} busy={busy}>
      <Banner tone="neutral" text={t('job.handover.why')} />
      <JobField
        value={note}
        onChangeText={setNote}
        placeholder={t('job.handover.placeholder')}
        multiline
        autoFocus
        maxLength={HANDOVER_NOTE_MAX}
      />
      <PhotoPicks picks={picks} addLabel={t('issues.addPhoto')} />
      <PrimaryButton label={t('job.handover.save')} onPress={() => void send()} disabled={!note.trim() || busy} loading={busy} />
      <QuietButton label={t('job.handover.later')} onPress={onClose} disabled={busy} />
    </JobSheet>
  );
}
