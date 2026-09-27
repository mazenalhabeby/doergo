import React, { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { CameraGlyph, GalleryGlyph } from './job-glyphs';
import { SectionLabel } from './job-ui';

export interface JobFile {
  id: string;
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  pendingSync?: boolean;
}

/**
 * "Photos & files" — a four-across grid (`.photos`). A held photo is on this
 * phone and marked "sending": nothing to open on the server yet and nothing
 * to delete there. A long press on a sent one asks to delete it.
 */
export function JobFiles({
  files,
  uploading,
  canAdd,
  onCamera,
  onGallery,
  onDelete,
}: {
  files: JobFile[];
  uploading: boolean;
  canAdd: boolean;
  onCamera: () => void;
  onGallery: () => void;
  onDelete: (file: JobFile) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  /* Four across with an 8pt gap — measured, because a percentage gap is not a thing every RN build draws. */
  const [width, setWidth] = useState(0);
  const side = width > 0 ? Math.floor((width - 3 * 8) / 4) : 0;
  const tile = { width: side, height: side, borderRadius: 14, overflow: 'hidden' as const };
  return (
    <View style={{ gap: amazen.space(2) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
        <View style={{ flex: 1 }}><SectionLabel>{t('job.files.title', { count: files.length })}</SectionLabel></View>
        {uploading ? <ActivityIndicator size="small" color={c.accent} /> : null}
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: side || 60 }}>
        {files.map((f) => {
          const image = (f.fileType ?? '').startsWith('image/');
          return (
            <Pressable
              key={f.id}
              onPress={() => { if (f.fileUrl && !f.pendingSync) void Linking.openURL(f.fileUrl); }}
              onLongPress={f.pendingSync ? undefined : () => onDelete(f)}
              accessibilityRole="button"
              accessibilityLabel={f.pendingSync ? t('offline.chip.waiting') : f.fileName}
              style={({ pressed }) => [tile, { backgroundColor: c.tile, opacity: pressed ? 0.8 : 1 }]}
            >
              {image && f.fileUrl ? (
                <Image source={{ uri: f.fileUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                  <AText variant="caption" tone="ink" numberOfLines={1} style={{ fontFamily: amazen.font.mono, textTransform: 'uppercase' }}>
                    {(f.fileName ?? '').split('.').pop()?.slice(0, 4) || 'FILE'}
                  </AText>
                  <AText variant="caption" tone="muted" numberOfLines={2} style={{ fontSize: 10, lineHeight: 12, textAlign: 'center' }}>{f.fileName}</AText>
                </View>
              )}
              {f.pendingSync ? (
                <View style={{ position: 'absolute', right: 5, top: 5, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, backgroundColor: c.canvas }}>
                  <AText variant="caption" tone="ink" style={{ fontSize: 9, lineHeight: 12 }}>{t('job.files.sending')}</AText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {canAdd ? (
          <>
            <AddTile side={side} label={t('job.files.camera')} onPress={onCamera} disabled={uploading}>
              <CameraGlyph size={20} color={c.inkMuted} contrast={c.well} />
            </AddTile>
            <AddTile side={side} label={t('job.files.gallery')} onPress={onGallery} disabled={uploading}>
              <GalleryGlyph size={20} color={c.inkMuted} contrast={c.well} />
            </AddTile>
          </>
        ) : null}
      </View>
    </View>
  );
}

function AddTile({ side, label, onPress, disabled, children }: { side: number; label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: side, height: side, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.lineField,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
