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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { tasksApi, type CreateTaskInput, type TechnicianListItem } from '../../../src/lib/api';
import { TechnicianPicker } from '../../../src/components';
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

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
type Priority = typeof PRIORITIES[number];

export default function CreateTaskScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [dueDateText, setDueDateText] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [selectedTechnician, setSelectedTechnician] = useState<TechnicianListItem | null>(null);
  const [showTechnicianPicker, setShowTechnicianPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a task title.');
      return;
    }

    try {
      setIsSubmitting(true);

      // Parse due date if provided (YYYY-MM-DD format)
      let dueDate: string | undefined;
      if (dueDateText.trim()) {
        const parsed = new Date(dueDateText.trim());
        if (!isNaN(parsed.getTime())) {
          dueDate = parsed.toISOString();
        }
      }

      const input: CreateTaskInput = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate,
        locationAddress: locationAddress.trim() || undefined,
        assignedToId: selectedTechnician?.id,
      };

      const task = await tasksApi.create(input);

      // Reset form
      setTitle('');
      setDescription('');
      setPriority('MEDIUM');
      setDueDateText('');
      setLocationAddress('');
      setSelectedTechnician(null);

      Alert.alert('Success', 'Task created successfully!', [
        { text: 'View Task', onPress: () => router.push(ROUTES.taskDetail(task.id)) },
        { text: 'OK' },
      ]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="What needs to be done?"
            placeholderTextColor={COLORS.slate400}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Add details about the task..."
            placeholderTextColor={COLORS.slate400}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />
        </View>

        {/* Priority */}
        <View style={styles.field}>
          <Text style={styles.label}>Priority</Text>
          <View style={styles.priorityRow}>
            {PRIORITIES.map((p) => {
              const style = getPriorityStyle(p);
              const isSelected = priority === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.priorityChip,
                    { backgroundColor: isSelected ? style.bg : COLORS.white },
                    isSelected && { borderColor: style.color },
                  ]}
                  onPress={() => setPriority(p)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.priorityDot, { backgroundColor: style.color }]} />
                  <Text
                    style={[
                      styles.priorityText,
                      isSelected && { color: style.color, fontWeight: FONT_WEIGHT.semibold },
                    ]}
                  >
                    {style.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Due Date */}
        <View style={styles.field}>
          <Text style={styles.label}>Due Date</Text>
          <View style={styles.dateButton}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.slate400} />
            <TextInput
              style={[styles.dateText, { flex: 1 }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.slate400}
              value={dueDateText}
              onChangeText={setDueDateText}
              maxLength={10}
              keyboardType="numbers-and-punctuation"
            />
            {dueDateText.length > 0 && (
              <TouchableOpacity onPress={() => setDueDateText('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.slate400} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Location */}
        <View style={styles.field}>
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter address..."
            placeholderTextColor={COLORS.slate400}
            value={locationAddress}
            onChangeText={setLocationAddress}
            maxLength={300}
          />
        </View>

        {/* Assign Technician */}
        <View style={styles.field}>
          <Text style={styles.label}>Assign Technician</Text>
          <TouchableOpacity
            style={styles.technicianButton}
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
                <Text style={styles.techName}>
                  {selectedTechnician.firstName} {selectedTechnician.lastName}
                </Text>
                <TouchableOpacity onPress={() => setSelectedTechnician(null)}>
                  <Ionicons name="close-circle" size={18} color={COLORS.slate400} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.techPlaceholder}>
                <Ionicons name="person-add-outline" size={20} color={COLORS.slate400} />
                <Text style={styles.placeholderText}>Select technician (optional)</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

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
              <Text style={styles.submitText}>Create Task</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>

      {/* Technician Picker Modal */}
      <TechnicianPicker
        visible={showTechnicianPicker}
        onClose={() => setShowTechnicianPicker(false)}
        onSelect={(tech) => {
          setSelectedTechnician(tech);
          setShowTechnicianPicker(false);
        }}
        selectedId={selectedTechnician?.id}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.slate50,
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
    color: COLORS.slate700,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    color: COLORS.slate800,
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
    borderColor: COLORS.slate200,
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
    color: COLORS.slate500,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  dateText: {
    flex: 1,
    fontSize: FONT_SIZE.base,
    color: COLORS.slate800,
  },
  placeholderText: {
    color: COLORS.slate400,
  },
  technicianButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.slate200,
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
    color: COLORS.slate800,
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
