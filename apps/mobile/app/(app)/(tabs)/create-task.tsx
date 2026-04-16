import { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { tasksApi, type CreateTaskInput, type TechnicianListItem } from '../../../src/lib/api';
import { useAuth } from '../../../src/contexts/auth-context';
import { TechnicianPicker } from '../../../src/components';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { colors } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const canAssign = user?.canAssignTasks ?? false;

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
        ...(canAssign && selectedTechnician?.id && { assignedToId: selectedTechnician.id }),
      };

      const task = await tasksApi.create(input);

      // Reset form
      setTitle('');
      setDescription('');
      setPriority('MEDIUM');
      setDueDate(null);
      setLocationAddress('');
      setLocationLat(null);
      setLocationLng(null);
      setSelectedTechnician(null);

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
                ? dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
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
  buttonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
});
