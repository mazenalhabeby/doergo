import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { PickedImage } from '../hooks/useImagePicker';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../lib/constants';

interface PhotoGridProps {
  photos: PickedImage[];
  type: 'BEFORE' | 'AFTER';
  onAddFromGallery: () => void;
  onAddFromCamera: () => void;
  onRemovePhoto: (index: number) => void;
  maxPhotos?: number;
  uploadProgress?: Map<number, number>;
}

export function PhotoGrid({
  photos,
  type,
  onAddFromGallery,
  onAddFromCamera,
  onRemovePhoto,
  maxPhotos = 5,
  uploadProgress,
}: PhotoGridProps) {
  const { t } = useTranslation();
  const canAdd = photos.length < maxPhotos;

  const handleRemove = (index: number) => {
    Alert.alert(t('components.photoGrid.removeTitle'), t('components.photoGrid.removeMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: () => onRemovePhoto(index) },
    ]);
  };

  const handleAdd = () => {
    Alert.alert(t('components.photoGrid.addTitle'), t('components.photoGrid.addChooseSource'), [
      { text: t('components.photoGrid.camera'), onPress: onAddFromCamera },
      { text: t('components.photoGrid.gallery'), onPress: onAddFromGallery },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{type === 'BEFORE' ? t('components.photoGrid.beforePhotos') : t('components.photoGrid.afterPhotos')}</Text>
        <Text style={styles.count}>{photos.length}/{maxPhotos}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {photos.map((photo, index) => {
          const progress = uploadProgress?.get(index);
          return (
            <View key={`${type}-${index}`} style={styles.thumbnail}>
              <Image source={{ uri: photo.uri }} style={styles.image} />
              {progress !== undefined && progress < 1 && (
                <View style={styles.progressOverlay}>
                  <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemove(index)}
              >
                <Ionicons name="close-circle" size={22} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          );
        })}

        {canAdd && (
          <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
            <Ionicons name="camera-outline" size={24} color={COLORS.slate400} />
            <Text style={styles.addText}>{t('components.photoGrid.add')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate700,
  },
  count: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.slate400,
  },
  scrollContent: {
    gap: SPACING.sm,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  removeButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: COLORS.white,
    borderRadius: 11,
  },
  addButton: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: COLORS.slate200,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.slate50,
  },
  addText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.slate400,
    marginTop: 2,
  },
});
