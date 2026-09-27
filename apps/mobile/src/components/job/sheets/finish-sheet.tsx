import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { useToast } from '../../../island/island-context';
import { useImagePicker, type PickedImage } from '../../../hooks/useImagePicker';
import type { CompleteTaskInput } from '../../../lib/api';
import { AText, LiveDot, PrimaryButton } from '../../amazen';
import { CameraGlyph, GalleryGlyph } from '../job-glyphs';
import { JobField, JobSheet, QuietButton, SectionLabel } from '../job-ui';
import { SignPad, type SignPadHandle } from '../sign-pad';
import { FINISH_STEPS, finishCanAdvance, finishMissing, type FinishDraft } from '../job-logic';

const MAX_PHOTOS = 5;

/**
 * Finish the job in three short steps — what you did, photos, sign-off —
 * instead of one long form (`renderSheet()` → `finish`).
 *
 * ⚠️ THE SAME REPORT, THE SAME RULES. Summary, the member's signature, the
 * customer's name and the customer's signature are required, exactly as the
 * old form required them; `finishCanAdvance` is the gate and is tested.
 *
 * ⚠️ ALL THREE STEPS STAY MOUNTED. "Back" from the sign-off must not throw
 * away two signatures the customer already gave — the steps that are not
 * shown are hidden, not unmounted.
 */
export function FinishSheet({
  visible,
  onClose,
  onJobText,
  busy,
  onComplete,
}: {
  visible: boolean;
  onClose: () => void;
  /** "1:12 on this job". */
  onJobText: string | null;
  busy: boolean;
  onComplete: (report: Omit<CompleteTaskInput, 'workDuration'>, photos: { before: PickedImage[]; after: PickedImage[] }) => Promise<boolean>;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const c = amazen.color;
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<FinishDraft>({ summary: '', details: '', customerName: '', techSigned: false, customerSigned: false });
  const [before, setBefore] = useState<PickedImage[]>([]);
  const [after, setAfter] = useState<PickedImage[]>([]);
  const [touching, setTouching] = useState(false);
  const tech = useRef<SignPadHandle>(null);
  const cust = useRef<SignPadHandle>(null);

  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setDraft({ summary: '', details: '', customerName: '', techSigned: false, customerSigned: false });
    setBefore([]);
    setAfter([]);
  }, [visible]);

  const names = [t('job.finish.stepDid'), t('job.finish.stepPhotos'), t('job.finish.stepSign')];
  const can = finishCanAdvance(step, draft);

  const complete = async () => {
    const technicianSignature = await tech.current?.toPng();
    const customerSignature = await cust.current?.toPng();
    if (!technicianSignature || !customerSignature) {
      toast.warning(t('common.required'), !technicianSignature ? t('taskDetail.completeTask.techSignatureRequired') : t('taskDetail.completeTask.customerSignatureRequired'));
      return;
    }
    const ok = await onComplete({
      summary: draft.summary.trim(),
      workPerformed: draft.details.trim() || undefined,
      technicianSignature,
      customerSignature,
      customerName: draft.customerName.trim(),
    }, { before, after });
    if (ok) onClose();
  };

  const missing = finishMissing(draft).map((k) => t(`job.finish.missing.${k}`));
  const hidden = (i: number) => ({ display: step === i ? 'flex' as const : 'none' as const, gap: amazen.space(3) });

  return (
    <JobSheet visible={visible} onClose={onClose} busy={busy} scrollEnabled={!touching}>
      <AText variant="h2" tone="strong" numberOfLines={2} style={{ fontFamily: amazen.font.sansLight }}>
        {step === 0 ? t('job.finish.title') : names[step]}
      </AText>
      <View style={{ gap: amazen.space(1.5) }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: FINISH_STEPS }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.accent : c.tile }} />
          ))}
        </View>
        <AText variant="caption" tone="ink" numberOfLines={1}>{t('job.finish.step', { index: step + 1, total: FINISH_STEPS, name: names[step] })}</AText>
      </View>

      {/* 1 — what you did */}
      <View style={hidden(0)}>
        {onJobText ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
            <LiveDot color={c.accent} size={7} />
            <AText variant="caption" tone="ink" numeric>{onJobText}</AText>
          </View>
        ) : null}
        <JobField value={draft.summary} onChangeText={(v) => setDraft((d) => ({ ...d, summary: v }))} placeholder={t('job.finish.summary')} multiline maxLength={200} />
        <JobField value={draft.details} onChangeText={(v) => setDraft((d) => ({ ...d, details: v }))} placeholder={t('job.finish.details')} multiline maxLength={500} />
      </View>

      {/* 2 — photos */}
      <View style={hidden(1)}>
        <SectionLabel>{t('job.finish.before')}</SectionLabel>
        <PhotoRow photos={before} setPhotos={setBefore} />
        <SectionLabel>{t('job.finish.after')}</SectionLabel>
        <PhotoRow photos={after} setPhotos={setAfter} />
      </View>

      {/* 3 — sign-off */}
      <View style={hidden(2)}>
        <SectionLabel>{t('job.finish.yourSignature')}</SectionLabel>
        <SignPad ref={tech} hint={t('job.finish.signHere')} onInk={(v) => setDraft((d) => ({ ...d, techSigned: v }))} onTouching={setTouching} />
        <JobField value={draft.customerName} onChangeText={(v) => setDraft((d) => ({ ...d, customerName: v }))} placeholder={t('job.finish.customerName')} maxLength={100} />
        <SectionLabel>{t('job.finish.customerSignature')}</SectionLabel>
        <SignPad ref={cust} hint={t('job.finish.handOver')} onInk={(v) => setDraft((d) => ({ ...d, customerSigned: v }))} onTouching={setTouching} />
      </View>

      {step < FINISH_STEPS - 1 ? (
        <PrimaryButton label={t('common.next')} onPress={() => setStep((s) => s + 1)} disabled={!can} />
      ) : (
        <PrimaryButton label={t('job.finish.complete')} onPress={() => void complete()} disabled={!can} loading={busy} />
      )}
      {step === FINISH_STEPS - 1 && !can && missing.length ? (
        <AText variant="caption" tone="ink" style={{ textAlign: 'center' }}>{t('job.finish.stillNeeded', { list: missing.join(', ') })}</AText>
      ) : null}
      {step > 0 ? <QuietButton label={t('common.back')} onPress={() => setStep((s) => s - 1)} disabled={busy} /> : null}
    </JobSheet>
  );
}

function PhotoRow({ photos, setPhotos }: { photos: PickedImage[]; setPhotos: React.Dispatch<React.SetStateAction<PickedImage[]>> }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { takePhoto, pickFromGallery } = useImagePicker();
  const c = amazen.color;
  const full = photos.length >= MAX_PHOTOS;
  const tile = { width: 64, height: 64, borderRadius: 14 };
  const add = (list: PickedImage[]) => setPhotos((p) => [...p, ...list].slice(0, MAX_PHOTOS));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {photos.map((p, i) => (
        <Pressable key={`${p.uri}:${i}`} onPress={() => setPhotos((prev) => prev.filter((_, k) => k !== i))} accessibilityRole="button" accessibilityLabel={t('common.remove')}>
          <Image source={{ uri: p.uri }} style={tile} />
        </Pressable>
      ))}
      {!full ? (
        <>
          <Pressable
            onPress={async () => { const p = await takePhoto('task-photo'); if (p) add([p]); }}
            accessibilityRole="button" accessibilityLabel={t('job.files.camera')}
            style={[tile, { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.lineField }]}
          >
            <CameraGlyph size={20} color={c.inkMuted} contrast={c.well} />
          </Pressable>
          <Pressable
            onPress={async () => { const ps = await pickFromGallery('task-photo'); if (ps.length) add(ps); }}
            accessibilityRole="button" accessibilityLabel={t('job.files.gallery')}
            style={[tile, { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.lineField }]}
          >
            <GalleryGlyph size={20} color={c.inkMuted} contrast={c.well} />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
