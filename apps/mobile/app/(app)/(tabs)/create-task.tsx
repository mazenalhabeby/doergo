import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTimeFormat } from '../../../src/hooks/useTimeFormat';
import { router } from 'expo-router';
import { tasksApi, taskAttachmentsApi, uploadToPresignedUrl, locationsApi, type CreateTaskInput, type TechnicianListItem } from '../../../src/lib/api';
import { useAuth } from '../../../src/contexts/auth-context';
import { useImagePicker, type PickedImage } from '../../../src/hooks/useImagePicker';
import { TechnicianPicker, ScreenContainer } from '../../../src/components';
import { LocationSearchPicker } from '../../../src/components/location-search-picker';
import { DatePickerModal } from '../../../src/components/date-picker-modal';
import { useToast } from '../../../src/contexts/toast-context';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
  ROUTES,
} from '../../../src/lib/constants';
import { getPriorityStyle } from '../../../src/lib/styles';
import { useTheme } from '../../../src/contexts/theme-context';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
type Priority = typeof PRIORITIES[number];

export default function CreateTaskScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [locationAddress, setLocationAddress] = useState('');
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [selectedTechnician, setSelectedTechnician] = useState<TechnicianListItem | null>(null);
  const [showTechnicianPicker, setShowTechnicianPicker] = useState(false);
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { colors } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  // Dates follow the active language rather than a hardcoded en-US locale.
  const { locale } = useTimeFormat();
  const { pickFromGallery, takePhoto } = useImagePicker();
  const canAssign = user?.canAssignTasks ?? false;
  const [photos, setPhotos] = useState<PickedImage[]>([]);

  // Load spaces and default to the org's "General" space (every task needs one).
  useEffect(() => {
    locationsApi
      .list()
      .then((list) => {
        const opts = list.map((l) => ({ id: l.id, name: l.name, isDefault: (l as { isDefault?: boolean }).isDefault }));
        setSpaces(opts.map(({ id, name }) => ({ id, name })));
        const def = opts.find((o) => o.isDefault) ?? opts.find((o) => o.name === 'General') ?? opts[0];
        if (def) setSpaceId(def.id);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.warning(t('common.required'), t('createTask.titleRequired'));
      return;
    }

    try {
      setIsSubmitting(true);

      const input: CreateTaskInput = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate?.toISOString(),
        locationAddress: locationAddress.trim() || undefined,
        locationLat: locationLat ?? undefined,
        locationLng: locationLng ?? undefined,
        ...(spaceId && { spaceId }),
        ...(canAssign && selectedTechnician?.id && { assignedToId: selectedTechnician.id }),
      };

      const task = await tasksApi.create(input);

      // Upload photos if any
      if (photos.length > 0 && task?.id) {
        for (const photo of photos) {
          try {
            const presign = await taskAttachmentsApi.getPresignedUrl(task.id, photo.fileName, photo.mimeType);
            if (presign?.uploadUrl) {
              await uploadToPresignedUrl(presign.uploadUrl, photo.uri, photo.mimeType);
              await taskAttachmentsApi.confirmUpload(task.id, {
                fileName: photo.fileName,
                fileUrl: presign.fileUrl,
                fileType: photo.mimeType,
                fileSize: photo.fileSize,
              });
            }
          } catch {
            // Continue with other photos
          }
        }
      }

      // Reset form
      setTitle('');
      setDescription('');
      setPriority('MEDIUM');
      setDueDate(null);
      setLocationAddress('');
      setLocationLat(null);
      setLocationLng(null);
      setSelectedTechnician(null);
      setPhotos([]);

      toast.success(t('common.success'), t('createTask.successMessage'));
      router.push(ROUTES.taskDetail(task.id));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('createTask.failedToCreate'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenContainer width="content">
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{t('createTask.titleLabel')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder={t('createTask.titlePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{t('createTask.descriptionLabel')}</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder={t('createTask.descriptionPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />
        </View>

        {/* Space — horizontal scroll of content-sized chips (a fixed flex row
            crushed 12+ spaces into slivers, wrapping the names vertically). */}
        {spaces.length > 1 && (
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, styles.labelInline, { color: colors.textPrimary }]}>{t('createTask.spaceLabel', 'Workspace')}</Text>
              <View style={[styles.countBadge, { backgroundColor: COLORS.primary + '18' }]}>
                <Text style={[styles.countBadgeText, { color: COLORS.primary }]}>
                  {t('createTask.spaceCount', '{{count}} available', { count: spaces.length })}
                </Text>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.spaceRow}
              keyboardShouldPersistTaps="handled"
            >
              {spaces.map((s) => {
                const isSelected = spaceId === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.spaceChip,
                      { backgroundColor: isSelected ? COLORS.primary + '20' : colors.card, borderColor: isSelected ? COLORS.primary : colors.border },
                    ]}
                    onPress={() => setSpaceId(s.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.priorityText,
                        { color: isSelected ? COLORS.primary : colors.textSecondary },
                        isSelected && { fontWeight: FONT_WEIGHT.semibold },
                      ]}
                    >
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Priority */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{t('createTask.priorityLabel')}</Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => {
              const style = getPriorityStyle(p);
              const isSelected = priority === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityChip,
                    { backgroundColor: isSelected ? style.bg : colors.card, borderColor: isSelected ? style.color : colors.border },
                  ]}
                  onPress={() => setPriority(p)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.priorityDot, { backgroundColor: style.color }]} />
                  <Text
                    style={[
                      styles.priorityText,
                      { color: colors.textSecondary },
                      isSelected && { color: style.color, fontWeight: FONT_WEIGHT.semibold },
                    ]}
                  >
                    {t(`priority.${p}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Due Date */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{t('createTask.dueDateLabel')}</Text>
          <TouchableOpacity
            style={[styles.dateButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={20} color={dueDate ? COLORS.primary : colors.textMuted} />
            <Text style={[styles.dateText, { flex: 1, color: dueDate ? colors.textPrimary : colors.textMuted }]}>
              {dueDate
                ? dueDate.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                : t('createTask.dueDatePlaceholder')}
            </Text>
            {dueDate && (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); setDueDate(null); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>

        {/* Date Picker Modal */}
        <DatePickerModal
          visible={showDatePicker}
          selectedDate={dueDate}
          onSelect={setDueDate}
          onClear={() => setDueDate(null)}
          onClose={() => setShowDatePicker(false)}
          title={t('createTask.dueDateLabel')}
        />

        {/* Location */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{t('createTask.locationLabel')}</Text>
          <LocationSearchPicker
            address={locationAddress}
            lat={locationLat}
            lng={locationLng}
            onLocationChange={(addr, lat, lng) => {
              setLocationAddress(addr);
              setLocationLat(lat);
              setLocationLng(lng);
            }}
          />
        </View>

        {/* Photos */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{t('createTask.photosLabel')}</Text>
          <View style={{ flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' }}>
            {photos.map((photo, idx) => (
              <View key={idx} style={{ position: 'relative' }}>
                <Image source={{ uri: photo.uri }} style={{ width: 72, height: 72, borderRadius: RADIUS.md }} />
                <TouchableOpacity
                  style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.card, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                >
                  <Ionicons name="close" size={12} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.addPhotoBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={async () => {
                const result = await pickFromGallery();
                if (result.length) setPhotos(prev => [...prev, ...result]);
              }}
            >
              <Ionicons name="image-outline" size={24} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addPhotoBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={async () => {
                const result = await takePhoto();
                if (result) setPhotos(prev => [...prev, result]);
              }}
            >
              <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Assign Technician - only for users with assign permission */}
        {canAssign && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>{t('createTask.assignTechnicianLabel')}</Text>
            <TouchableOpacity
              style={[styles.technicianButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setShowTechnicianPicker(true)}
              activeOpacity={0.7}
            >
              {selectedTechnician ? (
                <View style={styles.selectedTechnician}>
                  <View style={styles.techAvatar}>
                    <Text style={styles.techAvatarText}>
                      {selectedTechnician.firstName[0]}{selectedTechnician.lastName[0]}
                    </Text>
                  </View>
                  <Text style={[styles.techName, { color: colors.textPrimary }]}>
                    {selectedTechnician.firstName} {selectedTechnician.lastName}
                  </Text>
                  <TouchableOpacity onPress={() => setSelectedTechnician(null)}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.techPlaceholder}>
                  <Ionicons name="person-add-outline" size={20} color={colors.textMuted} />
                  <Text style={[styles.placeholderText, { color: colors.textMuted }]}>{t('createTask.technicianPlaceholder')}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color={COLORS.white} />
              <Text style={styles.submitText}>{t('createTask.submitButton')}</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
      </ScreenContainer>

      {/* Technician Picker Modal - only for users with assign permission */}
      {canAssign && (
        <TechnicianPicker
          visible={showTechnicianPicker}
          onClose={() => setShowTechnicianPicker(false)}
          onSelect={(tech) => {
            setSelectedTechnician(tech);
            setShowTechnicianPicker(false);
          }}
          selectedId={selectedTechnician?.id}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  field: {
    marginBottom: SPACING.xl,
  },
  label: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    marginBottom: SPACING.sm,
  },
  // Label + live count badge (e.g. "Space  ⬚ 12 available").
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  labelInline: {
    marginBottom: 0,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  countBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    ...SHADOWS.sm,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  // Space selector — content-sized chips in a horizontal scroll (many spaces).
  spaceRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
  },
  spaceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    gap: SPACING.xs,
    maxWidth: 220,
  },
  priorityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    gap: SPACING.xs,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  dateText: {
    flex: 1,
    fontSize: FONT_SIZE.base,
  },
  placeholderText: {
  },
  technicianButton: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    ...SHADOWS.sm,
  },
  selectedTechnician: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  techAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  techAvatarText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  },
  techName: {
    flex: 1,
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
  },
  techPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
});
