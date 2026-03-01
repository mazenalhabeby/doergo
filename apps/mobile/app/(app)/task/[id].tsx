import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { tasksApi, reportsApi, type Task, type Comment, type TaskStatus, type CompleteTaskInput, type UpdateTaskInput, type TechnicianListItem } from '../../../src/lib/api';
import { useAuth } from '../../../src/contexts/auth-context';
import { useLocationTracking } from '../../../src/hooks/useLocationTracking';
import { TechnicianPicker } from '../../../src/components';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../../src/lib/constants';
import { getStatusStyle, getPriorityStyle } from '../../../src/lib/styles';
import { getJobId } from '../../../src/lib/utils';

// Progress steps configuration for the detail view (6-step flow)
const PROGRESS_STEPS = [
  { key: 'ASSIGNED', label: 'Assigned', icon: 'checkmark' as const },
  { key: 'ACCEPTED', label: 'Accepted', icon: 'checkmark' as const },
  { key: 'EN_ROUTE', label: 'On The Way', icon: 'car' as const },
  { key: 'ARRIVED', label: 'Arrived', icon: 'location' as const },
  { key: 'IN_PROGRESS', label: 'In Progress', icon: 'construct' as const },
  { key: 'COMPLETED', label: 'Completed', icon: 'checkmark' as const },
] as const;

// Map task status to progress step index (specific to the 6-step detail view)
function getDetailProgressIndex(status: string): number {
  switch (status) {
    case 'ASSIGNED':
      return 0;
    case 'ACCEPTED':
      return 1;
    case 'EN_ROUTE':
      return 2;
    case 'ARRIVED':
      return 3;
    case 'IN_PROGRESS':
      return 4;
    case 'COMPLETED':
    case 'CLOSED':
      return 5;
    case 'BLOCKED':
      return 4; // Show as at in-progress step
    default:
      return -1;
  }
}

// Get next status action based on current status
interface StatusAction {
  nextStatus: TaskStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

function getStatusAction(status: string): StatusAction | null {
  switch (status) {
    case 'ASSIGNED':
      return { nextStatus: 'ACCEPTED', label: 'Accept Job', icon: 'checkmark-circle' };
    case 'ACCEPTED':
      return { nextStatus: 'EN_ROUTE', label: 'Start Driving', icon: 'car' };
    case 'EN_ROUTE':
      return { nextStatus: 'ARRIVED', label: "I've Arrived", icon: 'location' };
    case 'ARRIVED':
      return { nextStatus: 'IN_PROGRESS', label: 'Start Work', icon: 'construct' };
    case 'IN_PROGRESS':
      return { nextStatus: 'COMPLETED', label: 'Finish Job', icon: 'checkmark-done' };
    case 'BLOCKED':
      return { nextStatus: 'IN_PROGRESS', label: 'Resume Job', icon: 'play' };
    default:
      return null;
  }
}

// Format elapsed time for timer display (HH:MM:SS)
function formatElapsedTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'CLIENT';

  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showBlockReasonModal, setShowBlockReasonModal] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Completion modal state
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionSummary, setCompletionSummary] = useState('');
  const [completionDetails, setCompletionDetails] = useState('');

  // Admin modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<string>('MEDIUM');
  const [editLocation, setEditLocation] = useState('');

  // Location tracking hook - only active during EN_ROUTE status
  const {
    isTracking,
    lastLocation,
    startTracking,
    stopTracking,
    error: locationError,
  } = useLocationTracking({ taskId: task?.id });

  // Ref to prevent duplicate fetches
  const fetchingRef = useRef(false);
  const lastFetchedIdRef = useRef<string | null>(null);

  // Timer logic - starts when task is IN_PROGRESS
  useEffect(() => {
    if (task?.status === 'IN_PROGRESS') {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [task?.status]);

  // Auto-start/stop location tracking based on task status
  useEffect(() => {
    if (task?.status === 'EN_ROUTE' && !isTracking) {
      // Auto-start tracking when status changes to EN_ROUTE
      startTracking();
    } else if (task?.status !== 'EN_ROUTE' && isTracking) {
      // Auto-stop tracking when status changes from EN_ROUTE
      stopTracking();
    }
  }, [task?.status, isTracking, startTracking, stopTracking]);

  useEffect(() => {
    if (!id || fetchingRef.current) return;
    if (lastFetchedIdRef.current === id) return;

    const fetchData = async () => {
      try {
        fetchingRef.current = true;
        setIsLoading(true);
        setError(null);

        const [taskResponse, commentsResponse] = await Promise.all([
          tasksApi.getById(id),
          tasksApi.getComments(id),
        ]);

        setTask(taskResponse);
        setComments(commentsResponse);
        lastFetchedIdRef.current = id;
      } catch (err: any) {
        if (err?.statusCode === 401 || err?.message?.includes('Session expired')) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load task');
      } finally {
        setIsLoading(false);
        fetchingRef.current = false;
      }
    };

    fetchData();
  }, [id]);

  const handleRetry = useCallback(() => {
    lastFetchedIdRef.current = null;
    fetchingRef.current = false;
    setError(null);
    setIsLoading(true);

    const fetchData = async () => {
      try {
        fetchingRef.current = true;
        const [taskResponse, commentsResponse] = await Promise.all([
          tasksApi.getById(id!),
          tasksApi.getComments(id!),
        ]);
        setTask(taskResponse);
        setComments(commentsResponse);
        lastFetchedIdRef.current = id!;
      } catch (err: any) {
        if (err?.statusCode === 401) return;
        setError(err instanceof Error ? err.message : 'Failed to load task');
      } finally {
        setIsLoading(false);
        fetchingRef.current = false;
      }
    };
    fetchData();
  }, [id]);

  const handleStatusUpdate = async (newStatus: string, reason?: string) => {
    if (!task) return;

    if (newStatus === 'BLOCKED' && reason === undefined) {
      setBlockReason('');
      setShowBlockReasonModal(true);
      return;
    }

    // Show completion modal for COMPLETED status
    if (newStatus === 'COMPLETED') {
      setCompletionSummary('');
      setCompletionDetails('');
      setShowCompletionModal(true);
      return;
    }

    Alert.alert(
      'Update Status',
      `Change status to ${newStatus.replace('_', ' ')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              setIsUpdating(true);

              // Stop tracking IMMEDIATELY when transitioning away from EN_ROUTE
              // This prevents extra location requests while waiting for API response
              if (task.status === 'EN_ROUTE' && newStatus === 'ARRIVED') {
                stopTracking();
              }

              // Start tracking IMMEDIATELY when transitioning to EN_ROUTE
              // This ensures tracking starts without waiting for API response
              if (newStatus === 'EN_ROUTE') {
                startTracking();
              }

              const updatedTask = await tasksApi.updateStatus(task.id, newStatus, reason);
              setTask(updatedTask);
            } catch (err) {
              // If API fails while transitioning to ARRIVED, restart tracking
              if (task.status === 'EN_ROUTE' && newStatus === 'ARRIVED') {
                startTracking();
              }
              // If API fails while starting EN_ROUTE, stop tracking
              if (newStatus === 'EN_ROUTE') {
                stopTracking();
              }
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update status');
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  };

  // Handle task completion with service report
  const handleCompleteTask = async () => {
    if (!task) return;

    if (!completionSummary.trim()) {
      Alert.alert('Required', 'Please enter a summary of the work completed.');
      return;
    }

    try {
      setIsUpdating(true);
      setShowCompletionModal(false);

      const input: CompleteTaskInput = {
        summary: completionSummary.trim(),
        workPerformed: completionDetails.trim() || undefined,
        workDuration: elapsedTime,
      };

      await reportsApi.completeTask(task.id, input);

      // Refresh task data to show updated status
      const updatedTask = await tasksApi.getById(task.id);
      setTask(updatedTask);
      setElapsedTime(0);
      setCompletionSummary('');
      setCompletionDetails('');

      Alert.alert('Success', 'Job completed successfully!');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBlockSubmit = async () => {
    if (!task) return;
    try {
      setIsUpdating(true);
      setShowBlockReasonModal(false);
      const updatedTask = await tasksApi.updateStatus(task.id, 'BLOCKED', blockReason.trim() || undefined);
      setTask(updatedTask);
      setBlockReason('');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to report issue');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeclineTask = () => {
    if (!task) return;

    Alert.alert(
      'Decline Job',
      'Are you sure you want to decline this job? It will be returned to the dispatcher for reassignment.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsUpdating(true);
              await tasksApi.declineTask(task.id);
              Alert.alert('Job Declined', 'The job has been returned for reassignment.');
              router.back();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to decline job');
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenMaps = () => {
    if (!task?.locationLat || !task?.locationLng) return;
    const url = Platform.select({
      ios: `maps:0,0?q=${task.locationLat},${task.locationLng}`,
      android: `geo:0,0?q=${task.locationLat},${task.locationLng}(${encodeURIComponent(task.locationAddress || 'Location')})`,
    });
    if (url) Linking.openURL(url);
  };

  const handleStartNavigation = () => {
    if (!task?.locationLat || !task?.locationLng) return;
    const url = Platform.select({
      ios: `maps:0,0?daddr=${task.locationLat},${task.locationLng}`,
      android: `google.navigation:q=${task.locationLat},${task.locationLng}`,
    });
    if (url) Linking.openURL(url);
  };

  const handleCall = () => {
    // Since we don't have phone in task, use a placeholder action
    Alert.alert('Contact', 'Contact information not available for this task.');
  };

  // Admin: Assign technician
  const handleAssignTechnician = async (technician: TechnicianListItem) => {
    if (!task) return;
    try {
      setIsUpdating(true);
      setShowAssignModal(false);
      const updatedTask = await tasksApi.assign(task.id, technician.id);
      setTask(updatedTask);
      Alert.alert('Success', `Assigned to ${technician.firstName} ${technician.lastName}`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to assign');
    } finally {
      setIsUpdating(false);
    }
  };

  // Admin: Open edit modal
  const handleOpenEdit = () => {
    if (!task) return;
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditPriority(task.priority);
    setEditLocation(task.locationAddress || '');
    setShowEditModal(true);
  };

  // Admin: Submit edit
  const handleEditSubmit = async () => {
    if (!task || !editTitle.trim()) {
      Alert.alert('Required', 'Title is required.');
      return;
    }
    try {
      setIsUpdating(true);
      setShowEditModal(false);
      const input: UpdateTaskInput = {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority as any,
        locationAddress: editLocation.trim() || undefined,
      };
      const updatedTask = await tasksApi.update(task.id, input);
      setTask(updatedTask);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setIsUpdating(false);
    }
  };

  // Admin: Cancel task
  const handleCancelTask = () => {
    if (!task) return;
    Alert.alert('Cancel Task', 'Are you sure you want to cancel this task?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Task',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsUpdating(true);
            const updatedTask = await tasksApi.updateStatus(task.id, 'CANCELED');
            setTask(updatedTask);
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to cancel');
          } finally {
            setIsUpdating(false);
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Task Details', headerBackTitle: '' }} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !task) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ title: 'Error' }} />
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
        <Text style={styles.errorText}>{error || 'Task not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusStyle = getStatusStyle(task.status);
  const progressIndex = getDetailProgressIndex(task.status);
  const jobId = getJobId(task.id);
  const showTimer = !isAdmin && task.status === 'IN_PROGRESS';
  const statusAction = getStatusAction(task.status);
  const showLocationToggle = !isAdmin && task.status === 'EN_ROUTE';
  const showBottomBar = !['COMPLETED', 'CLOSED', 'CANCELED'].includes(task.status);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Block Reason Modal */}
      <Modal
        visible={showBlockReasonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBlockReasonModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Report Issue</Text>
            <Text style={styles.modalSubtitle}>What's blocking this task? (optional)</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="e.g., Waiting for parts, Customer unavailable..."
              placeholderTextColor={COLORS.slate400}
              value={blockReason}
              onChangeText={setBlockReason}
              multiline
              maxLength={200}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowBlockReasonModal(false);
                  setBlockReason('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, isUpdating && styles.buttonDisabled]}
                onPress={handleBlockSubmit}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.modalSubmitText}>Report Issue</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Completion Modal */}
      <Modal
        visible={showCompletionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCompletionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.completionModalContent}>
            <View style={styles.completionHeader}>
              <Ionicons name="checkmark-done-circle" size={40} color={COLORS.success} />
              <Text style={styles.completionTitle}>Complete Job</Text>
            </View>

            {/* Duration Display */}
            <View style={styles.completionDuration}>
              <Ionicons name="time-outline" size={18} color={COLORS.slate500} />
              <Text style={styles.completionDurationText}>
                Work Duration: {formatElapsedTime(elapsedTime)}
              </Text>
            </View>

            {/* Summary Input */}
            <Text style={styles.inputLabel}>Summary *</Text>
            <TextInput
              style={styles.summaryInput}
              placeholder="Brief summary of work completed..."
              placeholderTextColor={COLORS.slate400}
              value={completionSummary}
              onChangeText={setCompletionSummary}
              multiline
              maxLength={200}
              autoFocus
            />

            {/* Work Details Input */}
            <Text style={styles.inputLabel}>Work Details (optional)</Text>
            <TextInput
              style={styles.detailsInput}
              placeholder="Detailed description of work performed..."
              placeholderTextColor={COLORS.slate400}
              value={completionDetails}
              onChangeText={setCompletionDetails}
              multiline
              maxLength={500}
            />

            {/* Action Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowCompletionModal(false);
                  setCompletionSummary('');
                  setCompletionDetails('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.completionSubmitButton, isUpdating && styles.buttonDisabled]}
                onPress={handleCompleteTask}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="white" />
                    <Text style={styles.completionSubmitText}>Complete Job</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin: Assign Technician Modal */}
      <TechnicianPicker
        visible={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        onSelect={handleAssignTechnician}
        selectedId={task?.assignedToId}
      />

      {/* Admin: Edit Task Modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.completionModalContent}>
            <Text style={styles.modalTitle}>Edit Task</Text>

            <Text style={adminDetailStyles.editLabel}>Title *</Text>
            <TextInput
              style={styles.summaryInput}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Task title"
              placeholderTextColor={COLORS.slate400}
              maxLength={200}
            />

            <Text style={adminDetailStyles.editLabel}>Description</Text>
            <TextInput
              style={styles.detailsInput}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Task description"
              placeholderTextColor={COLORS.slate400}
              multiline
              maxLength={1000}
            />

            <Text style={adminDetailStyles.editLabel}>Priority</Text>
            <View style={adminDetailStyles.editPriorityRow}>
              {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((p) => {
                const pStyle = getPriorityStyle(p);
                const isSelected = editPriority === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      adminDetailStyles.editPriorityChip,
                      isSelected && { backgroundColor: pStyle.bg, borderColor: pStyle.color },
                    ]}
                    onPress={() => setEditPriority(p)}
                  >
                    <View style={[adminDetailStyles.editPriorityDot, { backgroundColor: pStyle.color }]} />
                    <Text style={[
                      adminDetailStyles.editPriorityText,
                      isSelected && { color: pStyle.color, fontWeight: FONT_WEIGHT.semibold },
                    ]}>
                      {pStyle.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={adminDetailStyles.editLabel}>Location</Text>
            <TextInput
              style={[styles.summaryInput, { minHeight: 44 }]}
              value={editLocation}
              onChangeText={setEditLocation}
              placeholder="Address"
              placeholderTextColor={COLORS.slate400}
              maxLength={300}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.completionSubmitButton, { backgroundColor: COLORS.primary }, isUpdating && styles.buttonDisabled]}
                onPress={handleEditSubmit}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.completionSubmitText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Stack.Screen
        options={{
          title: 'Task Details',
          headerBackTitle: '',
          headerRight: () => (
            <TouchableOpacity style={{ padding: 8 }}>
              <Ionicons name="ellipsis-vertical" size={20} color={COLORS.slate800} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Job Info Card */}
        <View style={styles.jobInfoCard}>
          <View style={styles.jobHeader}>
            <Text style={styles.jobIdText}>Job #{jobId}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                {statusStyle.label}
              </Text>
            </View>
          </View>

          {/* Machine/Equipment Info */}
          <View style={styles.infoRow}>
            <Ionicons name="construct-outline" size={18} color={COLORS.slate400} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Machine</Text>
              <Text style={styles.infoValue}>{task.title}</Text>
              {task.id && (
                <Text style={styles.infoSubValue}>S/N: {task.id.slice(0, 12).toUpperCase()}</Text>
              )}
            </View>
          </View>

          {/* Company Info */}
          {task.createdBy && (
            <View style={styles.infoRow}>
              <Ionicons name="business-outline" size={18} color={COLORS.slate400} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Company</Text>
                <Text style={styles.infoValue}>
                  {task.createdBy.firstName} {task.createdBy.lastName}
                </Text>
              </View>
            </View>
          )}

          {/* Contact */}
          <TouchableOpacity style={styles.infoRow} onPress={handleCall}>
            <Ionicons name="call-outline" size={18} color={COLORS.slate400} />
            <View style={styles.infoContent}>
              <Text style={[styles.infoValue, { color: COLORS.primary }]}>
                Contact Client
              </Text>
            </View>
          </TouchableOpacity>

          {/* Location */}
          {task.locationAddress && (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={18} color={COLORS.slate400} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>{task.locationAddress}</Text>
                <TouchableOpacity onPress={handleOpenMaps}>
                  <View style={styles.openMapsLink}>
                    <Text style={styles.openMapsText}>Open in Maps</Text>
                    <Ionicons name="open-outline" size={14} color={COLORS.primary} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Admin: Task Metadata */}
        {isAdmin && (
          <View style={adminDetailStyles.metaCard}>
            {task.assignedTo && (
              <View style={adminDetailStyles.metaRow}>
                <Ionicons name="person" size={16} color={COLORS.primary} />
                <Text style={adminDetailStyles.metaLabel}>Assigned to</Text>
                <Text style={adminDetailStyles.metaValue}>
                  {task.assignedTo.firstName} {task.assignedTo.lastName}
                </Text>
              </View>
            )}
            {!task.assignedTo && (
              <View style={adminDetailStyles.metaRow}>
                <Ionicons name="person-outline" size={16} color={COLORS.warning} />
                <Text style={[adminDetailStyles.metaValue, { color: COLORS.warning }]}>Unassigned</Text>
              </View>
            )}
            {task.createdBy && (
              <View style={adminDetailStyles.metaRow}>
                <Ionicons name="create-outline" size={16} color={COLORS.slate400} />
                <Text style={adminDetailStyles.metaLabel}>Created by</Text>
                <Text style={adminDetailStyles.metaValue}>
                  {task.createdBy.firstName} {task.createdBy.lastName}
                </Text>
              </View>
            )}
            <View style={adminDetailStyles.metaRow}>
              <Ionicons name="time-outline" size={16} color={COLORS.slate400} />
              <Text style={adminDetailStyles.metaLabel}>Created</Text>
              <Text style={adminDetailStyles.metaValue}>
                {new Date(task.createdAt).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </Text>
            </View>
          </View>
        )}

        {/* Progress Section (Technician only) */}
        {!isAdmin && (
        <View style={styles.progressCard}>
          <Text style={styles.sectionTitle}>Progress</Text>
          <View style={styles.progressSteps}>
            {PROGRESS_STEPS.map((step, index) => {
              const isCompleted = index < progressIndex;
              const isCurrent = index === progressIndex;
              const isPending = index > progressIndex;

              return (
                <View key={step.key} style={styles.progressStep}>
                  <View style={styles.progressStepLeft}>
                    <View
                      style={[
                        styles.progressIcon,
                        isCompleted && styles.progressIconCompleted,
                        isCurrent && styles.progressIconCurrent,
                        isPending && styles.progressIconPending,
                      ]}
                    >
                      <Ionicons
                        name={step.icon}
                        size={16}
                        color={isCompleted || isCurrent ? COLORS.white : COLORS.slate400}
                      />
                    </View>
                    {index < PROGRESS_STEPS.length - 1 && (
                      <View
                        style={[
                          styles.progressLine,
                          (isCompleted || isCurrent) && styles.progressLineCompleted,
                        ]}
                      />
                    )}
                  </View>
                  <View style={styles.progressStepContent}>
                    <Text
                      style={[
                        styles.progressStepLabel,
                        isCurrent && styles.progressStepLabelCurrent,
                      ]}
                    >
                      {step.label}
                    </Text>
                    <Text style={styles.progressStepStatus}>
                      {isCompleted ? 'Completed' : isCurrent ? 'Current Step' : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
        )}

        {/* Job Description */}
        {task.description && (
          <View style={styles.descriptionCard}>
            <Text style={styles.sectionTitle}>Job Description</Text>
            <Text style={styles.descriptionText}>{task.description}</Text>
          </View>
        )}

        {/* Attachments Section (Placeholder) */}
        <View style={styles.attachmentsCard}>
          <View style={styles.attachmentsHeader}>
            <Text style={styles.sectionTitle}>Attachments</Text>
            <TouchableOpacity>
              <View style={styles.viewReportLink}>
                <Ionicons name="document-text-outline" size={16} color={COLORS.primary} />
                <Text style={styles.viewReportText}>View Report</Text>
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.attachmentsThumbnails}>
            <View style={styles.attachmentPlaceholder}>
              <Ionicons name="image-outline" size={32} color={COLORS.slate300} />
            </View>
            <View style={styles.attachmentPlaceholder}>
              <Ionicons name="image-outline" size={32} color={COLORS.slate300} />
            </View>
          </View>
        </View>

        {/* Client Location with Map */}
        {task.locationLat && task.locationLng && (
          <View style={styles.locationCard}>
            <View style={styles.locationHeader}>
              <Ionicons name="location" size={20} color={COLORS.slate800} />
              <Text style={styles.locationTitle}>Client Location</Text>
            </View>
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                initialRegion={{
                  latitude: task.locationLat,
                  longitude: task.locationLng,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
              >
                <Marker
                  coordinate={{
                    latitude: task.locationLat,
                    longitude: task.locationLng,
                  }}
                />
              </MapView>
            </View>
            <Text style={styles.locationAddress}>{task.locationAddress}</Text>
            {!isAdmin && (
              <TouchableOpacity style={styles.navigationButton} onPress={handleStartNavigation}>
                <Ionicons name="navigate" size={20} color="white" />
                <Text style={styles.navigationButtonText}>Start Navigation</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Spacer for bottom bar */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Bar */}
      {showBottomBar && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {isAdmin ? (
            /* Admin Bottom Bar: Assign, Edit, Cancel */
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={adminDetailStyles.adminActionBtn}
                onPress={() => setShowAssignModal(true)}
                disabled={isUpdating}
              >
                <Ionicons name="person-add" size={18} color={COLORS.primary} />
                <Text style={adminDetailStyles.adminActionBtnText}>
                  {task.assignedToId ? 'Reassign' : 'Assign'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[adminDetailStyles.adminActionBtn, { backgroundColor: COLORS.primary }]}
                onPress={handleOpenEdit}
                disabled={isUpdating}
              >
                <Ionicons name="create" size={18} color={COLORS.white} />
                <Text style={[adminDetailStyles.adminActionBtnText, { color: COLORS.white }]}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[adminDetailStyles.adminActionBtn, { borderColor: COLORS.error }]}
                onPress={handleCancelTask}
                disabled={isUpdating}
              >
                <Ionicons name="close-circle" size={18} color={COLORS.error} />
                <Text style={[adminDetailStyles.adminActionBtnText, { color: COLORS.error }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Technician Bottom Bar */
            <>
              {/* Timer for IN_PROGRESS */}
              {showTimer && (
                <View style={styles.timerContainer}>
                  <Ionicons name="time-outline" size={20} color={COLORS.slate500} />
                  <Text style={styles.timerText}>{formatElapsedTime(elapsedTime)}</Text>
                </View>
              )}

              {/* Location Tracking Indicator */}
              {showLocationToggle && (
                <View style={styles.trackingRow}>
                  <View
                    style={[
                      styles.trackingIndicator,
                      isTracking && styles.trackingIndicatorActive,
                    ]}
                  >
                    <Ionicons
                      name={isTracking ? 'location' : 'location-outline'}
                      size={20}
                      color={isTracking ? COLORS.white : COLORS.slate400}
                    />
                    <Text
                      style={[
                        styles.trackingIndicatorText,
                        isTracking && styles.trackingIndicatorTextActive,
                      ]}
                    >
                      {isTracking ? 'Location Tracking Active' : 'Starting Tracking...'}
                    </Text>
                    {isTracking && (
                      <View style={styles.trackingPulse} />
                    )}
                  </View>
                  {locationError && (
                    <TouchableOpacity onPress={startTracking} style={styles.retryTrackingButton}>
                      <Text style={styles.retryTrackingText}>Retry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Action Buttons Row */}
              <View style={styles.actionButtonsRow}>
                {/* Report Issue Button (only for IN_PROGRESS) */}
                {task.status === 'IN_PROGRESS' && (
                  <TouchableOpacity
                    style={styles.reportIssueButton}
                    onPress={() => handleStatusUpdate('BLOCKED')}
                    disabled={isUpdating}
                  >
                    <Ionicons name="warning-outline" size={18} color={COLORS.error} />
                  </TouchableOpacity>
                )}

                {/* Accept/Decline Buttons for ASSIGNED status */}
                {task.status === 'ASSIGNED' ? (
                  <>
                    <TouchableOpacity
                      style={styles.declineButton}
                      onPress={() => handleDeclineTask()}
                      disabled={isUpdating}
                    >
                      <Ionicons name="close-circle-outline" size={20} color={COLORS.error} />
                      <Text style={styles.declineButtonText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.finishButton, { backgroundColor: COLORS.success }]}
                      onPress={() => handleStatusUpdate('ACCEPTED')}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color="white" />
                          <Text style={styles.finishButtonText}>Accept Job</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                ) : statusAction && (
                  <TouchableOpacity
                    style={[styles.finishButton, { backgroundColor: COLORS.success }]}
                    onPress={() => handleStatusUpdate(statusAction.nextStatus)}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Ionicons name={statusAction.icon} size={20} color="white" />
                        <Text style={styles.finishButtonText}>{statusAction.label}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
      )}
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.slate50,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxxl,
    backgroundColor: COLORS.slate50,
  },
  errorText: {
    fontSize: FONT_SIZE.xl,
    color: COLORS.slate500,
    textAlign: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.xxl,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.md,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  backButton: {
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // Job Info Card
  jobInfoCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.sm,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  jobIdText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.slate800,
  },
  statusBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.lg,
  },
  statusBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.slate50,
  },
  infoContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  infoLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate400,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.slate800,
    fontWeight: FONT_WEIGHT.medium,
  },
  infoSubValue: {
    fontSize: FONT_SIZE.md,
    color: COLORS.slate500,
    marginTop: 2,
  },
  openMapsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs + 2,
  },
  openMapsText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Progress Card
  progressCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
    marginBottom: SPACING.lg,
  },
  progressSteps: {
    gap: 0,
  },
  progressStep: {
    flexDirection: 'row',
    minHeight: 56,
  },
  progressStepLeft: {
    alignItems: 'center',
    width: 32,
  },
  progressIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.slate100,
  },
  progressIconCompleted: {
    backgroundColor: COLORS.success,
  },
  progressIconCurrent: {
    backgroundColor: COLORS.primary,
  },
  progressIconPending: {
    backgroundColor: COLORS.slate100,
  },
  progressLine: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.slate200,
    marginVertical: SPACING.xs,
  },
  progressLineCompleted: {
    backgroundColor: COLORS.success,
  },
  progressStepContent: {
    flex: 1,
    marginLeft: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  progressStepLabel: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.slate500,
    fontWeight: FONT_WEIGHT.medium,
  },
  progressStepLabelCurrent: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semibold,
  },
  progressStepStatus: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate400,
    marginTop: 2,
  },

  // Description Card
  descriptionCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  descriptionText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
    lineHeight: 22,
  },

  // Attachments Card
  attachmentsCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  attachmentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  viewReportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  viewReportText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },
  attachmentsThumbnails: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  attachmentPlaceholder: {
    width: 100,
    height: 80,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.slate50,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Location Card
  locationCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  locationTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
  },
  mapContainer: {
    height: 160,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  map: {
    flex: 1,
  },
  locationAddress: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  navigationButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
  },
  navigationButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.slate50,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.slate200,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  timerText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  reportIssueButton: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineButton: {
    flex: 0.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.error,
  },
  declineButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.error,
  },
  finishButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.primary,
  },
  finishButtonText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.xxl,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl + 2,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.slate800,
    marginBottom: SPACING.sm,
  },
  modalSubtitle: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
    marginBottom: SPACING.lg,
  },
  reasonInput: {
    backgroundColor: COLORS.slate50,
    borderRadius: RADIUS.md,
    padding: SPACING.md + 2,
    fontSize: FONT_SIZE.lg,
    minHeight: 100,
    maxHeight: 150,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORS.slate200,
    marginBottom: SPACING.xl,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.slate100,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate500,
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.error,
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Location Tracking Styles
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  trackingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.slate100,
  },
  trackingIndicatorActive: {
    backgroundColor: COLORS.success,
  },
  trackingIndicatorText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.slate500,
  },
  trackingIndicatorTextActive: {
    color: COLORS.white,
  },
  trackingPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.white,
    marginLeft: SPACING.xs,
  },
  retryTrackingButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  retryTrackingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Completion Modal Styles
  completionModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    width: '90%',
    maxWidth: 400,
  },
  completionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  completionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.slate800,
  },
  completionDuration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.slate100,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.lg,
  },
  completionDurationText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate600,
    fontWeight: FONT_WEIGHT.medium,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate700,
    marginBottom: SPACING.xs,
  },
  summaryInput: {
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    color: COLORS.slate800,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: SPACING.md,
  },
  detailsInput: {
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    color: COLORS.slate800,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: SPACING.lg,
  },
  completionSubmitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.success,
  },
  completionSubmitText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
});

// Admin-specific styles for task detail
const adminDetailStyles = StyleSheet.create({
  metaCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  metaLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate400,
  },
  metaValue: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.slate800,
  },
  adminActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  adminActionBtnText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  },
  editLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate700,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  editPriorityRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  editPriorityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.slate200,
    gap: SPACING.xs,
  },
  editPriorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  editPriorityText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.slate500,
  },
});
