import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { useImagePicker, type PickedImage } from '../../../hooks/useImagePicker';
import { AText, PrimaryButton } from '../../amazen';
import { Banner, ChoiceRow, JobField, JobSheet, QuietButton, SectionLabel } from '../job-ui';
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
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { takePhoto, pickFromGallery } = useImagePicker();
  const [what, setWhat] = useState('');
  const [severity, setSeverity] = useState<Severity>('MEDIUM');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<PickedImage[]>([]);

  useEffect(() => {
    if (!visible) return;
    setWhat(''); setSeverity('MEDIUM'); setNote(''); setPhotos([]);
  }, [visible]);

  const addPhoto = async () => {
    const img = await takePhoto('issue-photo');
    if (img) { setPhotos((p) => [...p, img].slice(0, MAX_PHOTOS)); return; }
    const imgs = await pickFromGallery('issue-photo');
    if (imgs.length) setPhotos((p) => [...p, ...imgs].slice(0, MAX_PHOTOS));
  };

  const send = async () => {
    const reason = issueReason(what, t(`issues.severity.${severity}`), note);
    if (await onSend(reason, photos)) onClose();
  };

  return (
    <JobSheet visible={visible} onClose={onClose} title={t('job.issue.title')} busy={busy}>
      <Banner tone="neutral" text={t('job.issue.context', { context })} />
      <JobField value={what} onChangeText={setWhat} placeholder={t('issues.titlePlaceholder')} maxLength={160} />
      <SectionLabel>{t('issues.howBadly')}</SectionLabel>
      <ChoiceRow options={SEVERITIES.map((k) => ({ key: k, label: t(`issues.severity.${k}`) }))} value={severity} onChange={setSeverity} />
      <JobField value={note} onChangeText={setNote} placeholder={t('issues.descriptionPlaceholder')} multiline maxLength={600} />
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {photos.map((p, i) => (
            <Pressable
              key={`${p.uri}:${i}`}
              onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
              accessibilityRole="button"
              accessibilityLabel={t('common.remove')}
              style={{ marginRight: amazen.space(2) }}
            >
              <Image source={{ uri: p.uri }} style={{ width: 56, height: 56, borderRadius: amazen.radius.tile }} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <QuietButton dashed label={`＋  ${t('issues.addPhoto')}`} onPress={() => void addPhoto()} disabled={photos.length >= MAX_PHOTOS} />
      <PrimaryButton label={t('issues.send')} onPress={() => void send()} disabled={!what.trim()} loading={busy} />
      <View>
        <AText variant="caption" tone="ink" style={{ textAlign: 'center' }}>{t('issues.sendHint')}</AText>
      </View>
    </JobSheet>
  );
}
