import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { type PickedImage } from '../../hooks/useImagePicker';
import { CameraGlyph, CloseGlyph, GalleryGlyph } from '../job/job-glyphs';
import { AddTile } from '../job/job-files';

export type Sheet = 'day' | 'time' | 'assign';

/** Photos — four across, each with a ✕, then the camera and the gallery (`.photos`). */
export function NewJobPhotos({ photos, onRemove, onCamera, onGallery }: {
  photos: PickedImage[];
  onRemove: (index: number) => void;
  onCamera: () => void;
  onGallery: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const [width, setWidth] = useState(0);
  const side = width > 0 ? Math.floor((width - 3 * 8) / 4) : 0;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: side || 60 }}>
      {photos.map((p, i) => (
        <View key={`${p.uri}:${i}`} style={{ width: side, height: side, borderRadius: 14, overflow: 'hidden', backgroundColor: c.tile }}>
          <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          <Pressable
            onPress={() => onRemove(i)}
            accessibilityRole="button"
            accessibilityLabel={t('common.remove')}
            hitSlop={6}
            style={{
              position: 'absolute',
              right: 4,
              top: 4,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: c.canvas,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseGlyph size={11} color={c.inkStrong} />
          </Pressable>
        </View>
      ))}
      <AddTile side={side} label={t('job.files.camera')} onPress={onCamera}>
        <CameraGlyph size={20} color={c.inkMuted} contrast={c.well} />
      </AddTile>
      <AddTile side={side} label={t('job.files.gallery')} onPress={onGallery}>
        <GalleryGlyph size={20} color={c.inkMuted} contrast={c.well} />
      </AddTile>
    </View>
  );
}
