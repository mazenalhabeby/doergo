import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Linking,
  Animated,
  Dimensions,
  Pressable,
  Image,
  StyleSheet as RNStyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { tasksApi, reportsApi, reportAttachmentsApi, taskAttachmentsApi, uploadToPresignedUrl, TaskStatus, type Task, type Comment, type CompleteTaskInput, type UpdateTaskInput, type TechnicianListItem } from '../../../src/lib/api';
import { Role } from '@hbcfield/shared/client';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { useSocketContext } from '../../../src/contexts/socket-context';
import { SocketEvents } from '../../../src/lib/socket';
import { useLocationTrackingContext } from '../../../src/contexts/location-tracking-context';
import { useImagePicker, type PickedImage } from '../../../src/hooks/useImagePicker';
import { PhotoGrid } from '../../../src/components/photo-grid';
import { SignatureCapture } from '../../../src/components/signature-capture';
import { TechnicianPicker, LoadingState, ErrorState } from '../../../src/components';
import { getStatusStyle, getPriorityStyle } from '../../../src/lib/styles';
import { getJobId, formatRelativeDate, formatTimeAgo } from '../../../src/lib/utils';
import {
  styles,
  adminDetailStyles,
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  PROGRESS_STEPS,
  getDetailProgressIndex,
  getStatusAction,
  formatElapsedTime,
} from '../../../src/components/task-detail';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const isAdmin = user?.role === Role.ADMIN || user?.role === 'CLIENT';

  // Bottom sheet animation
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const hasAnimatedIn = useRef(false);

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

  // Photo state for completion modal
  const [beforePhotos, setBeforePhotos] = useState<PickedImage[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<PickedImage[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Map<string, Map<number, number>>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const { pickFromGallery, takePhoto } = useImagePicker();

  // Task attachments state
  const [taskAttachments, setTaskAttachments] = useState<any[]>([]);
  const [taskAttachmentProgress, setTaskAttachmentProgress] = useState<Map<number, number>>(new Map());
  const [isUploadingTaskAttachment, setIsUploadingTaskAttachment] = useState(false);

  // Signature state for completion modal
  const [technicianSignature, setTechnicianSignature] = useState<string>('');
  const [customerSignature, setCustomerSignature] = useState<string>('');
  const [customerName, setCustomerName] = useState('');

  // Admin modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<string>('MEDIUM');
  const [editLocation, setEditLocation] = useState('');

  // Comment input state
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Location tracking from app-level context (survives screen navigation)
  const {
    isTracking,
    lastLocation,
    startTracking,
    stopTracking,
    error: locationError,
  } = useLocationTrackingContext();

  // Animate in on mount
  useEffect(() => {
    if (!hasAnimatedIn.current) {
      hasAnimatedIn.current = true;
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
      ]).start();
    }
  }, []);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => router.back());
  }, [slideAnim, overlayAnim]);

  // Ref to prevent duplicate fetches
  const fetchingRef = useRef(false);
  const lastFetchedIdRef = useRef<string | null>(null);

  // Timer logic - starts when task is IN_PROGRESS, seeded from real start time
  useEffect(() => {
    if (task?.status === TaskStatus.IN_PROGRESS) {
      // Tick every second — elapsedTime was seeded with the correct offset on fetch
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedTime(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [task?.status]);

  // Auto-start/stop location tracking based on task status
  // Tracking lives in app-level context — survives screen navigation
  useEffect(() => {
    if (task?.status === TaskStatus.EN_ROUTE && !isTracking && task.id) {
      startTracking(task.id);
    } else if (task?.status !== TaskStatus.EN_ROUTE && isTracking) {
      stopTracking();
    }
  }, [task?.status, task?.id, isTracking, startTracking, stopTracking]);

  useEffect(() => {
    if (!id || fetchingRef.current) return;
    if (lastFetchedIdRef.current === id) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        fetchingRef.current = true;
        setIsLoading(true);
        setError(null);

        const [taskResponse, commentsResponse, attachmentsResponse] = await Promise.all([
          tasksApi.getById(id),
          tasksApi.getComments(id),
          taskAttachmentsApi.getAttachments(id).catch(() => []),
        ]);

        // Don't update state if component unmounted or navigated away
        if (cancelled) return;

        // Seed elapsed timer from timeline if task is IN_PROGRESS
        if (taskResponse.status === TaskStatus.IN_PROGRESS) {
          try {
            const timeline = await tasksApi.getTimeline(id);
            const inProgressEvent = timeline.find(
              (e) => e.eventType === 'STATUS_CHANGED' && e.metadata?.newStatus === 'IN_PROGRESS',
            );
            if (inProgressEvent) {
              const startedAt = new Date(inProgressEvent.createdAt).getTime();
              const elapsed = Math.floor((Date.now() - startedAt) / 1000);
              setElapsedTime(Math.max(0, elapsed));
            }
          } catch {
            // Non-blocking — timer starts from 0 if timeline fails
          }
        }

        setTask(taskResponse);
        setComments(commentsResponse);
        setTaskAttachments(attachmentsResponse || []);
        lastFetchedIdRef.current = id;
      } catch (err: any) {
        if (cancelled) return;
        if (err?.statusCode === 401 || err?.message?.includes('Session expired')) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load task');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
        fetchingRef.current = false;
      }
    };

    fetchData();

    return () => { cancelled = true; };
  }, [id]);

  // Real-time updates via Socket.IO
  const { isConnected, subscribe } = useSocketContext();

  useEffect(() => {
    if (!isConnected || !id) return;

    const refreshTask = async () => {
      try {
        const updatedTask = await tasksApi.getById(id);
        setTask(updatedTask);
      } catch {
        // Ignore errors on background refresh
      }
    };

    const refreshComments = async () => {
      try {
        const updatedComments = await tasksApi.getComments(id);
        setComments(updatedComments);
      } catch {
        // Ignore errors on background refresh
      }
    };

    const unsubs = [
      subscribe(SocketEvents.TASK_STATUS_CHANGED, (data: any) => {
        if (data?.task?.id === id) refreshTask();
      }),
      subscribe(SocketEvents.TASK_UPDATED, (data: any) => {
        if (data?.task?.id === id) refreshTask();
      }),
      subscribe(SocketEvents.TASK_ASSIGNED, (data: any) => {
        if (data?.task?.id === id) refreshTask();
      }),
      subscribe(SocketEvents.TASK_COMMENT_ADDED, (data: any) => {
        if (data?.taskId === id) refreshComments();
      }),
    ];

    return () => unsubs.forEach(fn => fn());
  }, [isConnected, subscribe, id]);

  const handleAddComment = useCallback(async () => {
    if (!task || !newComment.trim()) return;
    try {
      setIsSubmittingComment(true);
      const comment = await tasksApi.addComment(task.id, newComment.trim());
      setComments(prev => [...prev, comment]);
      setNewComment('');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setIsSubmittingComment(false);
    }
  }, [task, newComment]);

  const handleRetry = useCallback(() => {
    lastFetchedIdRef.current = null;
    fetchingRef.current = false;
    setError(null);
    setIsLoading(true);

    const fetchData = async () => {
      try {
        fetchingRef.current = true;
        const [taskResponse, commentsResponse, attachmentsResponse] = await Promise.all([
          tasksApi.getById(id!),
          tasksApi.getComments(id!),
          taskAttachmentsApi.getAttachments(id!).catch(() => []),
        ]);

        // Seed elapsed timer from timeline if task is IN_PROGRESS
        if (taskResponse.status === TaskStatus.IN_PROGRESS) {
          try {
            const timeline = await tasksApi.getTimeline(id!);
            const inProgressEvent = timeline.find(
              (e) => e.eventType === 'STATUS_CHANGED' && e.metadata?.newStatus === 'IN_PROGRESS',
            );
            if (inProgressEvent) {
              const startedAt = new Date(inProgressEvent.createdAt).getTime();
              const elapsed = Math.floor((Date.now() - startedAt) / 1000);
              setElapsedTime(Math.max(0, elapsed));
            }
          } catch {
            // Non-blocking
          }
        }

        setTask(taskResponse);
        setComments(commentsResponse);
        setTaskAttachments(attachmentsResponse || []);
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

    if (newStatus === TaskStatus.BLOCKED && reason === undefined) {
      setBlockReason('');
      setShowBlockReasonModal(true);
      return;
    }

    // Show completion modal for COMPLETED status
    if (newStatus === TaskStatus.COMPLETED) {
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
              if (task.status === TaskStatus.EN_ROUTE && newStatus === TaskStatus.ARRIVED) {
                stopTracking();
              }

              // Start tracking IMMEDIATELY when transitioning to EN_ROUTE
              // This ensures tracking starts without waiting for API response
              if (newStatus === TaskStatus.EN_ROUTE) {
                startTracking(task.id);
              }

              const updatedTask = await tasksApi.updateStatus(task.id, newStatus, reason);
              setTask(updatedTask);
            } catch (err) {
              // If API fails while transitioning to ARRIVED, restart tracking
              if (task.status === TaskStatus.EN_ROUTE && newStatus === TaskStatus.ARRIVED) {
                startTracking(task.id);
              }
              // If API fails while starting EN_ROUTE, stop tracking
              if (newStatus === TaskStatus.EN_ROUTE) {
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

  // Upload photos to report after completion
  const uploadPhotos = async (reportId: string, photos: PickedImage[], type: 'BEFORE' | 'AFTER') => {
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]!;
      try {
        // Get presigned URL
        const { uploadUrl, fileUrl } = await reportAttachmentsApi.getPresignedUrl(
          reportId,
          photo.fileName,
          photo.mimeType,
        );

        // Upload to presigned URL
        await uploadToPresignedUrl(uploadUrl, photo.uri, photo.mimeType, (progress) => {
          setUploadProgress(prev => {
            const next = new Map(prev);
            const typeMap = new Map(next.get(type) || []);
            typeMap.set(i, progress);
            next.set(type, typeMap);
            return next;
          });
        });

        // Confirm upload
        await reportAttachmentsApi.confirmUpload(reportId, {
          type,
          fileName: photo.fileName,
          fileUrl,
          fileSize: photo.fileSize,
        });
      } catch (err) {
        console.warn(`[Photos] Failed to upload ${type} photo ${i}:`, err);
      }
    }
  };

  // Handle task completion with service report
  const handleCompleteTask = async () => {
    if (!task) return;

    if (!completionSummary.trim()) {
      Alert.alert('Required', 'Please enter a summary of the work completed.');
      return;
    }

    if (!technicianSignature) {
      Alert.alert('Required', 'Technician signature is required.');
      return;
    }

    if (!customerSignature) {
      Alert.alert('Required', 'Customer signature is required.');
      return;
    }

    if (!customerName.trim()) {
      Alert.alert('Required', 'Please enter the customer name.');
      return;
    }

    try {
      setIsUpdating(true);
      setShowCompletionModal(false);

      const input: CompleteTaskInput = {
        summary: completionSummary.trim(),
        workPerformed: completionDetails.trim() || undefined,
        workDuration: elapsedTime,
        technicianSignature,
        customerSignature,
        customerName: customerName.trim(),
      };

      const report = await reportsApi.completeTask(task.id, input);

      // Upload photos in background if any were taken
      const hasPhotos = beforePhotos.length > 0 || afterPhotos.length > 0;
      if (hasPhotos && report?.id) {
        setIsUploading(true);
        try {
          await Promise.all([
            uploadPhotos(report.id, beforePhotos, 'BEFORE'),
            uploadPhotos(report.id, afterPhotos, 'AFTER'),
          ]);
        } catch {
          // Photo upload failures are non-blocking
          console.warn('[Photos] Some photos failed to upload');
        }
        setIsUploading(false);
      }

      // Refresh task data to show updated status
      const updatedTask = await tasksApi.getById(task.id);
      setTask(updatedTask);
      setElapsedTime(0);
      setCompletionSummary('');
      setCompletionDetails('');
      setBeforePhotos([]);
      setAfterPhotos([]);
      setTechnicianSignature('');
      setCustomerSignature('');
      setCustomerName('');
      setUploadProgress(new Map());

      Alert.alert('Success', 'Job completed successfully!');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setIsUpdating(false);
      setIsUploading(false);
    }
  };

  // Upload a task attachment (photo from camera/gallery)
  const handleUploadTaskAttachment = async (photos: PickedImage[]) => {
    if (!task || photos.length === 0) return;
    setIsUploadingTaskAttachment(true);
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]!;
      try {
        const { uploadUrl, fileUrl } = await taskAttachmentsApi.getPresignedUrl(
          task.id,
          photo.fileName,
          photo.mimeType,
        );
        await uploadToPresignedUrl(uploadUrl, photo.uri, photo.mimeType, (progress) => {
          setTaskAttachmentProgress(prev => {
            const next = new Map(prev);
            next.set(i, progress);
            return next;
          });
        });
        await taskAttachmentsApi.confirmUpload(task.id, {
          fileName: photo.fileName,
          fileUrl,
          fileType: photo.mimeType,
          fileSize: photo.fileSize,
        });
      } catch (err) {
        console.warn(`[Attachments] Failed to upload photo ${i}:`, err);
        Alert.alert('Error', `Failed to upload ${photo.fileName}`);
      }
    }
    // Refresh attachments
    try {
      const updated = await taskAttachmentsApi.getAttachments(task.id);
      setTaskAttachments(updated || []);
    } catch {}
    setTaskAttachmentProgress(new Map());
    setIsUploadingTaskAttachment(false);
  };

  // Delete a task attachment
  const handleDeleteTaskAttachment = (attachmentId: string, fileName: string) => {
    if (!task) return;
    Alert.alert('Delete Attachment', `Delete "${fileName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await taskAttachmentsApi.delete(task.id, attachmentId);
            setTaskAttachments(prev => prev.filter(a => a.id !== attachmentId));
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete');
          }
        },
      },
    ]);
  };

  const handleBlockSubmit = async () => {
    if (!task) return;
    try {
      setIsUpdating(true);
      setShowBlockReasonModal(false);
      const updatedTask = await tasksApi.updateStatus(task.id, TaskStatus.BLOCKED, blockReason.trim() || undefined);
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
            const updatedTask = await tasksApi.updateStatus(task.id, TaskStatus.CANCELED);
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
      <View style={RNStyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View style={[RNStyleSheet.absoluteFillObject, { opacity: overlayAnim }]}>
          <BlurView intensity={40} tint="dark" style={RNStyleSheet.absoluteFill}>
            <Pressable style={RNStyleSheet.absoluteFill} onPress={handleClose} />
          </BlurView>
        </Animated.View>
        <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.sheetHandle} />
          <View style={[styles.sheetContent, { backgroundColor: colors.surface }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <LoadingState />
          </View>
        </Animated.View>
      </View>
    );
  }

  if (error || !task) {
    return (
      <View style={RNStyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View style={[RNStyleSheet.absoluteFillObject, { opacity: overlayAnim }]}>
          <BlurView intensity={40} tint="dark" style={RNStyleSheet.absoluteFill}>
            <Pressable style={RNStyleSheet.absoluteFill} onPress={handleClose} />
          </BlurView>
        </Animated.View>
        <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.sheetHandle} />
          <View style={[styles.sheetContent, { backgroundColor: colors.surface }]}>
            <View style={[styles.errorContainer, { backgroundColor: colors.surface }]}>
              <Stack.Screen options={{ headerShown: false }} />
              <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
              <Text style={[styles.errorText, { color: colors.textMuted }]}>{error || 'Task not found'}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.backButton} onPress={handleClose}>
                <Text style={styles.backButtonText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    );
  }

  const statusStyle = getStatusStyle(task.status, colors);
  const priorityStyle = getPriorityStyle(task.priority, colors);
  const progressIndex = getDetailProgressIndex(task.status);
  const jobId = getJobId(task.id);
  const showTimer = !isAdmin && task.status === TaskStatus.IN_PROGRESS;
  const statusAction = getStatusAction(task.status);
  const showLocationToggle = !isAdmin && task.status === TaskStatus.EN_ROUTE;
  const showBottomBar = ![TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED].includes(task.status);
  const currentStepLabel = PROGRESS_STEPS[progressIndex]?.label;

  // Due date gate — cannot accept a task scheduled for a future date
  const isFutureTask = (() => {
    if (!task.dueDate) return false;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return new Date(task.dueDate) > endOfToday;
  })();

  return (
    <View style={RNStyleSheet.absoluteFill} pointerEvents="box-none">
    <Animated.View style={[RNStyleSheet.absoluteFillObject, { opacity: overlayAnim }]}>
      <BlurView intensity={40} tint="dark" style={RNStyleSheet.absoluteFill}>
        <Pressable style={RNStyleSheet.absoluteFill} onPress={handleClose} />
      </BlurView>
    </Animated.View>
    <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: slideAnim }] }]}>
    <View style={styles.sheetHandle} />
    <KeyboardAvoidingView
      style={[styles.sheetContent, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.sheetHeader, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Task Details</Text>
        <TouchableOpacity onPress={handleClose}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      {/* Block Reason Modal */}
      <Modal
        visible={showBlockReasonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBlockReasonModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Report Issue</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>What's blocking this task? (optional)</Text>
            <TextInput
              style={[styles.reasonInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder="e.g., Waiting for parts, Customer unavailable..."
              placeholderTextColor={colors.textMuted}
              value={blockReason}
              onChangeText={setBlockReason}
              multiline
              maxLength={200}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelButton, { backgroundColor: colors.surfaceRaised }]}
                onPress={() => {
                  setShowBlockReasonModal(false);
                  setBlockReason('');
                }}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
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

      {/* Completion Modal — full-screen sheet */}
      <Modal
        visible={showCompletionModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCompletionModal(false)}
      >
        <View style={[styles.completionSheetContainer, { backgroundColor: colors.surface }]}>
          {/* Fixed Header */}
          <View style={[styles.completionSheetHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => {
                setShowCompletionModal(false);
                setCompletionSummary('');
                setCompletionDetails('');
                setBeforePhotos([]);
                setAfterPhotos([]);
                setTechnicianSignature('');
                setCustomerSignature('');
                setCustomerName('');
              }}
            >
              <Text style={styles.completionSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.completionSheetTitle, { color: colors.textPrimary }]}>Complete Job</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView
            style={styles.completionSheetScroll}
            contentContainerStyle={styles.completionSheetScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Duration Badge */}
            <View style={[styles.completionDurationBadge, { backgroundColor: colors.card }]}>
              <View style={[styles.completionDurationIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="time-outline" size={22} color={COLORS.primary} />
              </View>
              <View>
                <Text style={[styles.completionDurationLabel, { color: colors.textMuted }]}>Work Duration</Text>
                <Text style={[styles.completionDurationValue, { color: colors.textPrimary }]}>{formatElapsedTime(elapsedTime)}</Text>
              </View>
            </View>

            {/* Summary Section */}
            <View style={[styles.completionSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.completionSectionTitle, { color: colors.textMuted }]}>Summary *</Text>
              <TextInput
                style={[styles.completionTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="Brief summary of work completed..."
                placeholderTextColor={colors.textMuted}
                value={completionSummary}
                onChangeText={setCompletionSummary}
                multiline
                maxLength={200}
              />
            </View>

            {/* Work Details Section */}
            <View style={[styles.completionSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.completionSectionTitle, { color: colors.textMuted }]}>Work Details</Text>
              <TextInput
                style={[styles.completionTextInput, { minHeight: 100, backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder="Detailed description of work performed..."
                placeholderTextColor={colors.textMuted}
                value={completionDetails}
                onChangeText={setCompletionDetails}
                multiline
                maxLength={500}
              />
            </View>

            {/* Photos Section */}
            <View style={[styles.completionSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.completionSectionTitle, { color: colors.textMuted }]}>Photos</Text>
              <PhotoGrid
                photos={beforePhotos}
                type="BEFORE"
                onAddFromGallery={async () => {
                  const photos = await pickFromGallery();
                  if (photos.length > 0) {
                    setBeforePhotos(prev => [...prev, ...photos].slice(0, 5));
                  }
                }}
                onAddFromCamera={async () => {
                  const photo = await takePhoto();
                  if (photo) {
                    setBeforePhotos(prev => [...prev, photo].slice(0, 5));
                  }
                }}
                onRemovePhoto={(index) => {
                  setBeforePhotos(prev => prev.filter((_, i) => i !== index));
                }}
                uploadProgress={uploadProgress.get('BEFORE')}
              />
              <View style={{ height: SPACING.md }} />
              <PhotoGrid
                photos={afterPhotos}
                type="AFTER"
                onAddFromGallery={async () => {
                  const photos = await pickFromGallery();
                  if (photos.length > 0) {
                    setAfterPhotos(prev => [...prev, ...photos].slice(0, 5));
                  }
                }}
                onAddFromCamera={async () => {
                  const photo = await takePhoto();
                  if (photo) {
                    setAfterPhotos(prev => [...prev, photo].slice(0, 5));
                  }
                }}
                onRemovePhoto={(index) => {
                  setAfterPhotos(prev => prev.filter((_, i) => i !== index));
                }}
                uploadProgress={uploadProgress.get('AFTER')}
              />
            </View>

            {/* Signatures Section */}
            <View style={[styles.completionSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.completionSectionTitle, { color: colors.textMuted }]}>Signatures</Text>
              <SignatureCapture
                title="Technician Signature *"
                onSave={setTechnicianSignature}
                onClear={() => setTechnicianSignature('')}
                existingSignature={technicianSignature}
              />
              <View style={{ height: SPACING.md }} />
              <SignatureCapture
                title="Customer Signature *"
                onSave={setCustomerSignature}
                onClear={() => setCustomerSignature('')}
                existingSignature={customerSignature}
              />
              <View style={{ marginTop: SPACING.md }}>
                <Text style={[styles.completionSectionTitle, { color: colors.textMuted }]}>Customer Name *</Text>
                <TextInput
                  style={[styles.completionTextInput, { minHeight: 44, backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder="Customer name..."
                  placeholderTextColor={colors.textMuted}
                  value={customerName}
                  onChangeText={setCustomerName}
                  maxLength={100}
                />
              </View>
            </View>

            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Sticky Bottom Action Bar */}
          <View style={[styles.completionSheetFooter, { paddingBottom: Math.max(insets.bottom, SPACING.lg), backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.completionSheetSubmitBtn, isUpdating && styles.buttonDisabled]}
              onPress={handleCompleteTask}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color="white" />
                  <Text style={styles.completionSheetSubmitText}>Complete Job</Text>
                </>
              )}
            </TouchableOpacity>
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
          <View style={[styles.completionModalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Edit Task</Text>

            <Text style={[adminDetailStyles.editLabel, { color: colors.textSecondary }]}>Title *</Text>
            <TextInput
              style={[styles.summaryInput, { borderColor: colors.border, color: colors.textPrimary }]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Task title"
              placeholderTextColor={colors.textMuted}
              maxLength={200}
            />

            <Text style={[adminDetailStyles.editLabel, { color: colors.textSecondary }]}>Description</Text>
            <TextInput
              style={[styles.detailsInput, { borderColor: colors.border, color: colors.textPrimary }]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Task description"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={1000}
            />

            <Text style={[adminDetailStyles.editLabel, { color: colors.textSecondary }]}>Priority</Text>
            <View style={adminDetailStyles.editPriorityRow}>
              {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((p) => {
                const pStyle = getPriorityStyle(p, colors);
                const isSelected = editPriority === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      adminDetailStyles.editPriorityChip,
                      { borderColor: colors.border },
                      isSelected && { backgroundColor: pStyle.bg, borderColor: pStyle.color },
                    ]}
                    onPress={() => setEditPriority(p)}
                  >
                    <View style={[adminDetailStyles.editPriorityDot, { backgroundColor: pStyle.color }]} />
                    <Text style={[
                      adminDetailStyles.editPriorityText,
                      { color: colors.textSecondary },
                      isSelected && { color: pStyle.color, fontWeight: FONT_WEIGHT.semibold },
                    ]}>
                      {pStyle.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[adminDetailStyles.editLabel, { color: colors.textSecondary }]}>Location</Text>
            <TextInput
              style={[styles.summaryInput, { minHeight: 44, borderColor: colors.border, color: colors.textPrimary }]}
              value={editLocation}
              onChangeText={setEditLocation}
              placeholder="Address"
              placeholderTextColor={colors.textMuted}
              maxLength={300}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelButton, { backgroundColor: colors.surfaceRaised }]}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
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

      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Section 1: Hero Status Card */}
        <View style={[styles.heroCard, { backgroundColor: colors.card }]}>
          <View style={styles.heroHeader}>
            <Text style={[styles.heroJobId, { color: colors.textMuted }]}>JOB #{jobId}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                {statusStyle.label}
              </Text>
            </View>
          </View>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>{task.title}</Text>
          <View style={styles.heroMeta}>
            <View style={[styles.priorityBadge, { backgroundColor: priorityStyle.bg }]}>
              <View style={[styles.priorityDot, { backgroundColor: priorityStyle.color }]} />
              <Text style={[styles.priorityText, { color: priorityStyle.color }]}>
                {priorityStyle.label}
              </Text>
            </View>
            {task.dueDate && (
              <View style={styles.dueDateRow}>
                <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.dueDateText, { color: colors.textSecondary }]}>{formatRelativeDate(task.dueDate)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Section 2: Compact Progress Dots (Technician only) */}
        {!isAdmin && progressIndex >= 0 && (
          <View style={[styles.progressCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.progressLabel, { color: colors.textMuted }]}>PROGRESS</Text>
            <View style={styles.progressDotsRow}>
              {PROGRESS_STEPS.map((step, index) => {
                const isCompleted = index < progressIndex;
                const isCurrent = index === progressIndex;
                const isLast = index === PROGRESS_STEPS.length - 1;
                return (
                  <View key={step.key} style={[styles.progressDotWrapper, isLast && styles.progressDotWrapperLast]}>
                    <View
                      style={[
                        styles.progressDot,
                        isCompleted && styles.progressDotCompleted,
                        isCurrent && styles.progressDotCurrent,
                        !isCompleted && !isCurrent && [styles.progressDotPending, { backgroundColor: colors.border }],
                      ]}
                    />
                    {!isLast && (
                      <View
                        style={[
                          styles.progressLine,
                          { backgroundColor: colors.border },
                          isCompleted && styles.progressLineCompleted,
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </View>
            {currentStepLabel && (
              <Text style={styles.progressCurrentLabel}>{currentStepLabel}</Text>
            )}
          </View>
        )}

        {/* Section 3: Info Rows Card */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>DETAILS</Text>

          {/* Created by */}
          {task.createdBy && (
            <View style={styles.infoRow}>
              <View style={[styles.infoIconCircle, { backgroundColor: colors.surfaceRaised }]}>
                <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Created by</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                  {task.createdBy.firstName} {task.createdBy.lastName}
                </Text>
                <Text style={[styles.infoSubValue, { color: colors.textSecondary }]}>
                  {new Date(task.createdAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </Text>
              </View>
            </View>
          )}

          {/* Assigned to (admin view) */}
          {isAdmin && (
            <View style={[styles.infoRow, styles.infoRowBorder, { borderTopColor: colors.border }]}>
              <View style={[styles.infoIconCircle, { backgroundColor: colors.surfaceRaised }]}>
                <Ionicons name="person" size={16} color={task.assignedTo ? COLORS.primary : COLORS.warning} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Assigned to</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }, !task.assignedTo && { color: COLORS.warning }]}>
                  {task.assignedTo
                    ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`
                    : 'Unassigned'}
                </Text>
              </View>
            </View>
          )}

          {/* Location */}
          {task.locationAddress && (
            <View style={[styles.infoRow, styles.infoRowBorder, { borderTopColor: colors.border }]}>
              <View style={[styles.infoIconCircle, { backgroundColor: colors.surfaceRaised }]}>
                <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Location</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{task.locationAddress}</Text>
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

        {/* Section 4: Description Card */}
        {task.description ? (
          <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>DESCRIPTION</Text>
            <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>{task.description}</Text>
          </View>
        ) : null}

        {/* Section 5: Location Map Card */}
        {task.locationLat && task.locationLng ? (
          <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>LOCATION</Text>
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
            <Text style={[styles.locationAddress, { color: colors.textSecondary }]}>{task.locationAddress}</Text>
            {!isAdmin && [TaskStatus.ASSIGNED, TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE].includes(task.status) && (
              <TouchableOpacity style={styles.navigationButton} onPress={handleStartNavigation}>
                <Ionicons name="navigate" size={20} color="white" />
                <Text style={styles.navigationButtonText}>Start Navigation</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Section 6: Attachments */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
          <View style={styles.attachmentsHeader}>
            <Text style={[styles.sectionTitleInline, { color: colors.textMuted }]}>
              ATTACHMENTS{taskAttachments.length > 0 ? ` (${taskAttachments.length})` : ''}
            </Text>
            <View style={styles.attachmentUploadRow}>
              <TouchableOpacity
                onPress={async () => {
                  const photo = await takePhoto();
                  if (photo) handleUploadTaskAttachment([photo]);
                }}
                disabled={isUploadingTaskAttachment}
                style={styles.attachmentUploadBtn}
              >
                <Ionicons name="camera-outline" size={18} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  const photos = await pickFromGallery();
                  if (photos.length > 0) handleUploadTaskAttachment(photos);
                }}
                disabled={isUploadingTaskAttachment}
                style={styles.attachmentUploadBtn}
              >
                <Ionicons name="images-outline" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {isUploadingTaskAttachment && (
            <View style={styles.attachmentUploadProgress}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.attachmentUploadText}>Uploading...</Text>
            </View>
          )}

          {taskAttachments.length > 0 ? (
            <View style={styles.attachmentGrid}>
              {taskAttachments.map((att) => (
                <TouchableOpacity
                  key={att.id}
                  onLongPress={() => handleDeleteTaskAttachment(att.id, att.fileName)}
                  onPress={() => {
                    if (att.fileUrl) Linking.openURL(att.fileUrl);
                  }}
                >
                  {att.fileType?.startsWith('image/') ? (
                    <View style={[styles.attachmentThumb, { backgroundColor: colors.surfaceRaised }]}>
                      <Image
                        source={{ uri: att.fileUrl }}
                        style={styles.attachmentThumbImage}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View style={[styles.attachmentDocCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name="document-text" size={28} color={COLORS.primary} />
                      <Text style={[styles.attachmentDocName, { color: colors.textSecondary }]} numberOfLines={1}>
                        {att.fileName}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.attachmentEmptyState}>
              <Ionicons name="cloud-upload-outline" size={28} color={colors.textMuted} />
              <Text style={[styles.attachmentEmptyText, { color: colors.textMuted }]}>No attachments yet</Text>
              <Text style={[styles.attachmentEmptyHint, { color: colors.textMuted }]}>Tap camera or gallery to add</Text>
            </View>
          )}
        </View>

        {/* Section 7: Comments */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            COMMENTS{comments.length > 0 ? ` (${comments.length})` : ''}
          </Text>

          {comments.length > 0 ? (
            comments.map((comment) => {
              const initials = `${comment.user.firstName.charAt(0)}${comment.user.lastName.charAt(0)}`.toUpperCase();
              return (
                <View key={comment.id} style={styles.commentItem}>
                  <View style={[styles.commentAvatar, { backgroundColor: colors.primaryLight }]}>
                    <Text style={styles.commentAvatarText}>{initials}</Text>
                  </View>
                  <View style={styles.commentBody}>
                    <View style={styles.commentHeader}>
                      <Text style={[styles.commentAuthor, { color: colors.textPrimary }]}>
                        {comment.user.firstName} {comment.user.lastName}
                      </Text>
                      <Text style={[styles.commentTime, { color: colors.textMuted }]}>
                        {formatTimeAgo(comment.createdAt)}
                      </Text>
                    </View>
                    <Text style={[styles.commentText, { color: colors.textSecondary }]}>{comment.content}</Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.commentsEmpty}>
              <Text style={[styles.commentsEmptyText, { color: colors.textMuted }]}>No comments yet</Text>
            </View>
          )}

          <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}>
            <TextInput
              style={[styles.commentInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textMuted}
              value={newComment}
              onChangeText={setNewComment}
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.commentSendBtn,
                (!newComment.trim() || isSubmittingComment) && [styles.commentSendBtnDisabled, { backgroundColor: colors.border }],
              ]}
              onPress={handleAddComment}
              disabled={!newComment.trim() || isSubmittingComment}
            >
              {isSubmittingComment ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Ionicons name="send" size={16} color={COLORS.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Spacer for bottom bar */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Bar */}
      {showBottomBar && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.card, borderTopColor: colors.border }]}>
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
                    <TouchableOpacity onPress={() => task && startTracking(task.id)} style={styles.retryTrackingButton}>
                      <Text style={styles.retryTrackingText}>Retry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Future Date Banner — shown when task is accepted but can't start yet */}
              {task.status === TaskStatus.ACCEPTED && isFutureTask && (
                <View style={styles.futureDateBanner}>
                  <Ionicons name="calendar-outline" size={20} color={COLORS.amber} />
                  <Text style={styles.futureDateText}>
                    This task is scheduled for {new Date(task.dueDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. You can start it on the due date.
                  </Text>
                </View>
              )}

              {/* Action Buttons Row */}
              <View style={styles.actionButtonsRow}>
                {/* Report Issue Button (only for IN_PROGRESS) */}
                {task.status === TaskStatus.IN_PROGRESS && (
                  <TouchableOpacity
                    style={styles.reportIssueButton}
                    onPress={() => handleStatusUpdate(TaskStatus.BLOCKED)}
                    disabled={isUpdating}
                  >
                    <Ionicons name="warning-outline" size={18} color={COLORS.error} />
                  </TouchableOpacity>
                )}

                {/* Accept/Decline Buttons for ASSIGNED status */}
                {task.status === TaskStatus.ASSIGNED ? (
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
                      onPress={() => handleStatusUpdate(TaskStatus.ACCEPTED)}
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
                    style={[styles.finishButton, { backgroundColor: (isFutureTask && statusAction.nextStatus === TaskStatus.EN_ROUTE) ? COLORS.slate300 : COLORS.success }]}
                    onPress={() => handleStatusUpdate(statusAction.nextStatus)}
                    disabled={isUpdating || (isFutureTask && statusAction.nextStatus === TaskStatus.EN_ROUTE)}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Ionicons name={(isFutureTask && statusAction.nextStatus === TaskStatus.EN_ROUTE) ? 'time-outline' : statusAction.icon} size={20} color="white" />
                        <Text style={styles.finishButtonText}>
                          {(isFutureTask && statusAction.nextStatus === TaskStatus.EN_ROUTE) ? 'Not Yet Available' : statusAction.label}
                        </Text>
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
    </Animated.View>
    </View>
  );
}

