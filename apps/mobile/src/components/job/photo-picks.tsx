import React, { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useImagePicker, type PickedImage } from '../../hooks/useImagePicker';
import type { MediaPurpose } from '../../permissions/purposes';
import { QuietButton } from './job-ui';

/**
 * Photos picked for something about to be sent — the camera first, the gallery
 * if the camera was closed, a tap on one to drop it. ONE control for every sheet
 * that sends a note with pictures (an issue, a handover), so they cannot drift.
 */
export function usePhotoPicks(max: number, tag: MediaPurpose) {
  const { takePhoto, pickFromGallery } = useImagePicker();
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const add = useCallback(async () => {
    const img = await takePhoto(tag);
    if (img) { setPhotos((p) => [...p, img].slice(0, max)); return; }
    const imgs = await pickFromGallery(tag);
    if (imgs.length) setPhotos((p) => [...p, ...imgs].slice(0, max));
  }, [takePhoto, pickFromGallery, tag, max]);
  const remove = useCallback((i: number) => setPhotos((prev) => prev.filter((_, idx) => idx !== i)), []);
  const reset = useCallback(() => setPhotos([]), []);
  return { photos, add, remove, reset, full: photos.length >= max };
}

export function PhotoPicks({ picks, addLabel }: { picks: ReturnType<typeof usePhotoPicks>; addLabel: string }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  return (
    <>
      {picks.photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {picks.photos.map((p, i) => (
            <Pressable
              key={`${p.uri}:${i}`}
              onPress={() => picks.remove(i)}
              accessibilityRole="button"
              accessibilityLabel={t('common.remove')}
              style={{ marginRight: amazen.space(2) }}
            >
              <Image source={{ uri: p.uri }} style={{ width: 56, height: 56, borderRadius: amazen.radius.tile }} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <QuietButton dashed label={`＋  ${addLabel}`} onPress={() => void picks.add()} disabled={picks.full} />
    </>
  );
}
