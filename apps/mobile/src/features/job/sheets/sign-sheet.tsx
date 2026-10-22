import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PrimaryButton } from '../../../components/amazen';
import { JobSheet } from '../job-ui';
import { SignPad, type SignPadHandle } from '../sign-pad';

/**
 * A signature asked for AT A STEP (the `signature` capability) — kept on the
 * job as a picture, through the same photo queue as any other file.
 */
export function SignSheet({
  visible,
  onClose,
  busy,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  busy: boolean;
  onSave: (png: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const pad = useRef<SignPadHandle>(null);
  const [ink, setInk] = useState(false);
  const [touching, setTouching] = useState(false);
  const save = async () => {
    const png = await pad.current?.toPng();
    if (!png) return;
    await onSave(png);
    onClose();
  };
  return (
    <JobSheet visible={visible} onClose={onClose} title={t('taskDetail.thisStep.signature')} busy={busy} scrollEnabled={!touching}>
      <SignPad ref={pad} hint={t('job.finish.signHere')} onInk={setInk} onTouching={setTouching} height={170} />
      <PrimaryButton label={t('job.sign.save')} onPress={() => void save()} disabled={!ink} loading={busy} />
    </JobSheet>
  );
}
