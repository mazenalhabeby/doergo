import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Linking,
  Animated,
  Pressable,
  Image,
  StyleSheet as RNStyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { tasksApi, reportsApi, reportAttachmentsApi, taskAttachmentsApi, uploadToPresignedUrl, TaskStatus, type Task, type Comment, type CompleteTaskInput, type UpdateTaskInput, type TechnicianListItem } from '../../../src/lib/api';
import { Role } from '@hbcfield/shared/client';
import { useAuth } from '../../../src/contexts/auth-context';
import { useToast } from '../../../src/contexts/toast-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { useSocketContext } from '../../../src/contexts/socket-context';
import { SocketEvents } from '../../../src/lib/socket';
import * as Location from 'expo-location';
import { useLocationTrackingContext } from '../../../src/contexts/location-tracking-context';
import { useImagePicker, type PickedImage } from '../../../src/hooks/useImagePicker';
import { PhotoGrid } from '../../../src/components/photo-grid';
import { SignatureCapture } from '../../../src/components/signature-capture';
import { TechnicianPicker, LoadingState, ErrorState, ConfirmSheet, centeredContent } from '../../../src/components';
import { TourTarget } from '../../../src/components/tour';
import { useResponsive } from '../../../src/lib/responsive';
import { CustomFieldsCard } from '../../../src/components/custom-fields-card';
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
  getProgressSteps,
  getDetailProgressIndex,
  getStatusAction,
  formatElapsedTime,
} from '../../../src/components/task-detail';
import { getFlowSteps, hasCapability, getStatusCapabilities, tierAllows, type TaskCapability } from '@hbcfield/shared/client';

/**
 * The task detail UI. Rendered two ways:
 *  - as the `/task/[id]` route (default export below) → full-screen slide-up sheet
 *  - embedded in the tasks tab's master-detail split (embedded) → inline pane
 */
export function TaskDetailPane({
  taskId,
  embedded = false,
  onClose,
}: {
  taskId: string;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const id = taskId;
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  // Live window height (updates on rotation) for the slide-up sheet animation.
  const SCREEN_HEIGHT = r.height;
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
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

  // Per-step widget state (visit form notes + inline signature)
  const [stepNote, setStepNote] = useState('');
  const [savingStepNote, setSavingStepNote] = useState(false);
  const [stepSignature, setStepSignature] = useState('');

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

  // Confirm sheet states
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [pendingStatusReason, setPendingStatusReason] = useState<string | undefined>(undefined);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [showDeleteAttachmentConfirm, setShowDeleteAttachmentConfirm] = useState(false);
  const [deleteAttachmentTarget, setDeleteAttachmentTarget] = useState<{ id: string; fileName: string } | null>(null);
  const [showCancelTaskConfirm, setShowCancelTaskConfirm] = useState(false);

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
    // Embedded (master-detail pane): just clear the selection, no slide-out.
    if (embedded) {
      onClose?.();
      return;
    }
    Animated.parallel([
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
    ]).start(() => router.back());
  }, [slideAnim, overlayAnim, embedded, onClose, SCREEN_HEIGHT]);

  // Ref to prevent duplicate fetches
  const fetchingRef = useRef(false);
  const lastFetchedIdRef = useRef<string | null>(null);

  // Timer — DB-anchored to acceptedAt so it never resets when the task is
  // reopened. Recomputed from the timestamp each tick (now − acceptedAt), runs
  // while the task is active, and freezes at completedAt.
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    const acceptedAt = task?.acceptedAt ? new Date(task.acceptedAt).getTime() : null;
    if (!acceptedAt) { setElapsedTime(0); return; }

    const end = task?.completedAt ? new Date(task.completedAt).getTime() : null;
    const compute = () => Math.max(0, Math.floor(((end ?? Date.now()) - acceptedAt) / 1000));
    setElapsedTime(compute());

    const ACTIVE = [
      TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED,
      TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED,
    ];
    if (end || !ACTIVE.includes(task?.status as any)) return; // frozen / not active

    timerRef.current = setInterval(() => setElapsedTime(compute()), 1000);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [task?.acceptedAt, task?.completedAt, task?.status]);

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
        setError(err instanceof Error ? err.message : t('taskDetail.failedToLoad'));
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
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToAddComment'));
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
        setError(err instanceof Error ? err.message : t('taskDetail.failedToLoad'));
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

    // Completion: collect a service report only when the TARGET status has the
    // 'report' capability (field-service COMPLETED). Others just mark it done.
    const flow = getFlowSteps((task as any).workflow);
    const targetIsFinal =
      newStatus === TaskStatus.COMPLETED || !!flow.find((s) => s.key === newStatus)?.isFinal;
    const targetCaps = getStatusCapabilities((task as any)?.workflow?.name, newStatus);
    if (targetIsFinal && hasCapability(targetCaps, 'report')) {
      setCompletionSummary('');
      setCompletionDetails('');
      setShowCompletionModal(true);
      return;
    }

    setPendingStatus(newStatus);
    setPendingStatusReason(reason);
    setShowStatusConfirm(true);
  };

  const confirmStatusUpdate = async () => {
    if (!task || !pendingStatus) return;
    const newStatus = pendingStatus;
    const reason = pendingStatusReason;
    setShowStatusConfirm(false);
    setPendingStatus(null);
    setPendingStatusReason(undefined);
    try {
      setIsUpdating(true);

      if (task.status === TaskStatus.EN_ROUTE && newStatus === TaskStatus.ARRIVED) {
        stopTracking();
      }

      if (newStatus === TaskStatus.EN_ROUTE) {
        startTracking(task.id);
      }

      // Get GPS location for statuses that require location verification
      let location: { lat: number; lng: number } | undefined;
      const locationRequiredStatuses = [TaskStatus.ARRIVED, TaskStatus.IN_PROGRESS];
      if (locationRequiredStatuses.includes(newStatus as any)) {
        try {
          const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
          if (permStatus === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            location = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          }
        } catch {
          // Location will be undefined — backend will reject if task has location set
        }
      }

      const updatedTask = await tasksApi.updateStatus(task.id, newStatus, reason, location);
      setTask(updatedTask);
    } catch (err) {
      if (task.status === TaskStatus.EN_ROUTE && newStatus === TaskStatus.ARRIVED) {
        startTracking(task.id);
      }
      if (newStatus === TaskStatus.EN_ROUTE) {
        stopTracking();
      }
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToUpdateStatus'));
    } finally {
      setIsUpdating(false);
    }
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
      toast.warning(t('common.required'), t('taskDetail.completeTask.summaryRequired'));
      return;
    }

    if (!technicianSignature) {
      toast.warning(t('common.required'), t('taskDetail.completeTask.techSignatureRequired'));
      return;
    }

    if (!customerSignature) {
      toast.warning(t('common.required'), t('taskDetail.completeTask.customerSignatureRequired'));
      return;
    }

    if (!customerName.trim()) {
      toast.warning(t('common.required'), t('taskDetail.completeTask.customerNameRequired'));
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

      toast.success(t('common.success'), t('taskDetail.completeTask.successMessage'));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToComplete'));
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
        toast.error(t('common.error'), t('taskDetail.failedToDelete'));
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

  // Per-step: save visit notes as a comment (reuses the comments thread).
  const handleSaveStepNote = useCallback(async () => {
    if (!task || !stepNote.trim()) return;
    setSavingStepNote(true);
    try {
      const comment = await tasksApi.addComment(task.id, stepNote.trim());
      setComments((prev) => [comment, ...prev]);
      setStepNote('');
      toast.success(t('common.success'), '');
    } catch {
      toast.error(t('common.error'), '');
    } finally {
      setSavingStepNote(false);
    }
  }, [task, stepNote, t]);

  // Per-step: capture an inline signature and persist it as a task attachment.
  const handleStepSignature = useCallback(async (base64: string) => {
    setStepSignature(base64);
    if (!task || !base64) return;
    try {
      await handleUploadTaskAttachment([
        { uri: base64, fileName: `signature_${Date.now()}.png`, fileType: 'image/png', width: 600, height: 200 } as unknown as PickedImage,
      ]);
    } catch {
      // best-effort — the captured signature remains visible locally
    }
  }, [task]);

  // Delete a task attachment
  const handleDeleteTaskAttachment = (attachmentId: string, fileName: string) => {
    if (!task) return;
    setDeleteAttachmentTarget({ id: attachmentId, fileName });
    setShowDeleteAttachmentConfirm(true);
  };

  const confirmDeleteAttachment = async () => {
    if (!task || !deleteAttachmentTarget) return;
    const { id: attachmentId } = deleteAttachmentTarget;
    setShowDeleteAttachmentConfirm(false);
    setDeleteAttachmentTarget(null);
    try {
      await taskAttachmentsApi.delete(task.id, attachmentId);
      setTaskAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToDelete'));
    }
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
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToReportIssue'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeclineTask = () => {
    if (!task) return;
    setShowDeclineConfirm(true);
  };

  const confirmDeclineTask = async () => {
    if (!task) return;
    setShowDeclineConfirm(false);
    try {
      setIsUpdating(true);
      await tasksApi.declineTask(task.id);
      toast.info(t('taskDetail.declineTask.successTitle'), t('taskDetail.declineTask.successMessage'));
      handleClose();
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToDecline'));
    } finally {
      setIsUpdating(false);
    }
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
      toast.success(t('common.success'), t('taskDetail.assignedSuccess', { firstName: technician.firstName, lastName: technician.lastName }));
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToAssign'));
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
      toast.warning(t('common.required'), t('taskDetail.titleRequired'));
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
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToUpdate'));
    } finally {
      setIsUpdating(false);
    }
  };

  // Admin: Cancel task
  const handleCancelTask = () => {
    if (!task) return;
    setShowCancelTaskConfirm(true);
  };

  const confirmCancelTask = async () => {
    if (!task) return;
    setShowCancelTaskConfirm(false);
    try {
      setIsUpdating(true);
      const updatedTask = await tasksApi.updateStatus(task.id, TaskStatus.CANCELED);
      setTask(updatedTask);
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('taskDetail.failedToCancel'));
    } finally {
      setIsUpdating(false);
    }
  };

  // Wraps branch content in the correct chrome: full-screen slide-up sheet for
  // the route, or a plain flex pane when embedded in the master-detail split.
  // Defined as a plain function (not a component) so children reconcile in place
  // and are NOT remounted on every render.
  const renderShell = (children: ReactNode) =>
    embedded ? (
      <View style={{ flex: 1, backgroundColor: colors.surface }}>{children}</View>
    ) : (
      <View style={RNStyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View style={[RNStyleSheet.absoluteFillObject, { opacity: overlayAnim }]}>
          <BlurView intensity={40} tint="dark" style={RNStyleSheet.absoluteFill}>
            <Pressable style={RNStyleSheet.absoluteFill} onPress={handleClose} />
          </BlurView>
        </Animated.View>
        <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.sheetHandle} />
          {children}
        </Animated.View>
      </View>
    );

  if (isLoading) {
    return renderShell(
      <View style={[styles.sheetContent, { backgroundColor: colors.surface }]}>
        {!embedded && <Stack.Screen options={{ headerShown: false }} />}
        <LoadingState />
      </View>,
    );
  }

  if (error || !task) {
    return renderShell(
      <View style={[styles.sheetContent, { backgroundColor: colors.surface }]}>
        <View style={[styles.errorContainer, { backgroundColor: colors.surface }]}>
          {!embedded && <Stack.Screen options={{ headerShown: false }} />}
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={[styles.errorText, { color: colors.textMuted }]}>{error || t('taskDetail.taskNotFound')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={handleClose}>
            <Text style={styles.backButtonText}>{t('taskDetail.goBack')}</Text>
          </TouchableOpacity>
        </View>
      </View>,
    );
  }

  const statusStyle = getStatusStyle(task.status, colors);
  const priorityStyle = getPriorityStyle(task.priority, colors);
  // Flow + capabilities are data-driven by the task's workflow (defaults to
  // field-service when absent — existing behaviour preserved).
  const flowSteps = getFlowSteps((task as any).workflow);
  const progressSteps = getProgressSteps(flowSteps);
  const caps = ((task as any).capabilities as TaskCapability[] | undefined);
  const progressIndex = getDetailProgressIndex(task.status, flowSteps);
  const jobId = getJobId(task.id);
  // Timer is visible from accept through execution (counts from acceptedAt).
  const showTimer = !isAdmin && hasCapability(caps, 'timer') && !!task.acceptedAt && [
    TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED,
    TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED,
  ].includes(task.status as any);
  const statusAction = getStatusAction(task.status, flowSteps);
  // GPS toggle is purely capability-driven now: it shows on whatever status has
  // the 'gps' capability (field-service → En route, logistics → In transit, …).
  const showLocationToggle = !isAdmin && hasCapability(caps, 'gps');
  const showBottomBar = ![TaskStatus.COMPLETED, TaskStatus.CLOSED, TaskStatus.CANCELED].includes(task.status);
  const currentStepLabel = progressSteps[progressIndex]?.label;

  // Due date gate — cannot accept a task scheduled for a future date
  const isFutureTask = (() => {
    if (!task.dueDate) return false;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return new Date(task.dueDate) > endOfToday;
  })();

  return renderShell(
    <>
    <KeyboardAvoidingView
      style={[styles.sheetContent, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.sheetHeader, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('taskDetail.title')}</Text>
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
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('taskDetail.blockTask.title')}</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{t('taskDetail.blockTask.subtitle')}</Text>
            <TextInput
              style={[styles.reasonInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder={t('taskDetail.blockTask.placeholder')}
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
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, isUpdating && styles.buttonDisabled]}
                onPress={handleBlockSubmit}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.modalSubmitText}>{t('taskDetail.blockTask.submitButton')}</Text>
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
              <Text style={styles.completionSheetCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={[styles.completionSheetTitle, { color: colors.textPrimary }]}>{t('taskDetail.completeTask.title')}</Text>
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
                <Text style={[styles.completionDurationLabel, { color: colors.textMuted }]}>{t('taskDetail.completeTask.workDuration')}</Text>
                <Text style={[styles.completionDurationValue, { color: colors.textPrimary }]}>{formatElapsedTime(elapsedTime)}</Text>
              </View>
            </View>

            {/* Summary Section */}
            <View style={[styles.completionSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.completionSectionTitle, { color: colors.textMuted }]}>{t('taskDetail.completeTask.summaryLabel')}</Text>
              <TextInput
                style={[styles.completionTextInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder={t('taskDetail.completeTask.summaryPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={completionSummary}
                onChangeText={setCompletionSummary}
                multiline
                maxLength={200}
              />
            </View>

            {/* Work Details Section */}
            <View style={[styles.completionSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.completionSectionTitle, { color: colors.textMuted }]}>{t('taskDetail.completeTask.workDetailsLabel')}</Text>
              <TextInput
                style={[styles.completionTextInput, { minHeight: 100, backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                placeholder={t('taskDetail.completeTask.workDetailsPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={completionDetails}
                onChangeText={setCompletionDetails}
                multiline
                maxLength={500}
              />
            </View>

            {/* Photos Section */}
            <View style={[styles.completionSection, { backgroundColor: colors.card }]}>
              <Text style={[styles.completionSectionTitle, { color: colors.textMuted }]}>{t('taskDetail.completeTask.photosLabel')}</Text>
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
              <Text style={[styles.completionSectionTitle, { color: colors.textMuted }]}>{t('taskDetail.completeTask.signaturesLabel')}</Text>
              <SignatureCapture
                title={t('taskDetail.completeTask.technicianSignature')}
                onSave={setTechnicianSignature}
                onClear={() => setTechnicianSignature('')}
                existingSignature={technicianSignature}
              />
              <View style={{ height: SPACING.md }} />
              <SignatureCapture
                title={t('taskDetail.completeTask.customerSignature')}
                onSave={setCustomerSignature}
                onClear={() => setCustomerSignature('')}
                existingSignature={customerSignature}
              />
              <View style={{ marginTop: SPACING.md }}>
                <Text style={[styles.completionSectionTitle, { color: colors.textMuted }]}>{t('taskDetail.completeTask.customerNameLabel')}</Text>
                <TextInput
                  style={[styles.completionTextInput, { minHeight: 44, backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder={t('taskDetail.completeTask.customerNamePlaceholder')}
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
                  <Text style={styles.completionSheetSubmitText}>{t('taskDetail.completeTask.submitButton')}</Text>
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
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('taskDetail.editTask.title')}</Text>

            <Text style={[adminDetailStyles.editLabel, { color: colors.textSecondary }]}>{t('taskDetail.editTask.titleLabel')}</Text>
            <TextInput
              style={[styles.summaryInput, { borderColor: colors.border, color: colors.textPrimary }]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder={t('taskDetail.editTask.titlePlaceholder')}
              placeholderTextColor={colors.textMuted}
              maxLength={200}
            />

            <Text style={[adminDetailStyles.editLabel, { color: colors.textSecondary }]}>{t('taskDetail.editTask.descriptionLabel')}</Text>
            <TextInput
              style={[styles.detailsInput, { borderColor: colors.border, color: colors.textPrimary }]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder={t('taskDetail.editTask.descriptionPlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={1000}
            />

            <Text style={[adminDetailStyles.editLabel, { color: colors.textSecondary }]}>{t('taskDetail.editTask.priorityLabel')}</Text>
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

            <Text style={[adminDetailStyles.editLabel, { color: colors.textSecondary }]}>{t('taskDetail.editTask.locationLabel')}</Text>
            <TextInput
              style={[styles.summaryInput, { minHeight: 44, borderColor: colors.border, color: colors.textPrimary }]}
              value={editLocation}
              onChangeText={setEditLocation}
              placeholder={t('taskDetail.editTask.locationPlaceholder')}
              placeholderTextColor={colors.textMuted}
              maxLength={300}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelButton, { backgroundColor: colors.surfaceRaised }]}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.completionSubmitButton, { backgroundColor: COLORS.primary }, isUpdating && styles.buttonDisabled]}
                onPress={handleEditSubmit}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.completionSubmitText}>{t('taskDetail.editTask.saveButton')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {!embedded && <Stack.Screen options={{ headerShown: false }} />}

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={r.isTablet ? centeredContent(720) : undefined}>
        {/* Section 1: Hero Status Card */}
        <TourTarget name="taskdetail-header" style={[styles.heroCard, { backgroundColor: colors.card }]}>
          <View style={styles.heroHeader}>
            <Text style={[styles.heroJobId, { color: colors.textMuted }]}>{t('taskDetail.jobId', { id: jobId })}</Text>
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
        </TourTarget>

        {/* Section 2: Compact Progress Dots (Technician only) */}
        {!isAdmin && progressIndex >= 0 && (
          <TourTarget name="taskdetail-status" style={[styles.progressCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.progressLabel, { color: colors.textMuted }]}>{t('taskDetail.progress')}</Text>
            <View style={styles.progressDotsRow}>
              {progressSteps.map((step, index) => {
                const isCompleted = index < progressIndex;
                const isCurrent = index === progressIndex;
                const isLast = index === progressSteps.length - 1;
                return (
                  <View key={step.key} style={[styles.progressDotWrapper, isLast && styles.progressDotWrapperLast]}>
                    <View
                      style={[
                        styles.progressDot,
                        isCompleted && styles.progressDotCompleted,
                        isCurrent && styles.progressDotCurrent,
                        !isCompleted && !isCurrent && [styles.progressDotPending, { backgroundColor: colors.borderLight }],
                      ]}
                    />
                    {!isLast && (
                      <View
                        style={[
                          styles.progressLine,
                          { backgroundColor: colors.borderLight },
                          isCompleted && styles.progressLineCompleted,
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </View>
            {currentStepLabel && (
              <Text style={[styles.progressCurrentLabel, { color: colors.textPrimary }]}>{currentStepLabel}</Text>
            )}
          </TourTarget>
        )}

        {/* Per-step widgets — driven by the current status's capabilities */}
        {!isAdmin && (hasCapability(caps, 'checklist') || hasCapability(caps, 'photos') || hasCapability(caps, 'form') || hasCapability(caps, 'signature')) && (
          <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('taskDetail.thisStep.title')}</Text>

            {hasCapability(caps, 'checklist') && (
              <View style={{ marginBottom: hasCapability(caps, 'photos') ? 14 : 0 }}>
                {(((task as any).checklistItems?.length ?? 0) === 0) ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('taskDetail.thisStep.noChecklistItems')}</Text>
                ) : (
                  (task as any).checklistItems.map((it: any) => {
                    const done = it.completed ?? it.isCompleted ?? false;
                    return (
                      <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}>
                        <Ionicons name={done ? 'checkbox' : 'square-outline'} size={20} color={done ? '#16A34A' : colors.textMuted} />
                        <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }}>{it.text ?? it.title}</Text>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {hasCapability(caps, 'photos') && (
              <View>
                {taskAttachments.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {taskAttachments.slice(0, 6).map((a: any) => (
                      <Image key={a.id} source={{ uri: a.fileUrl }} style={{ width: 60, height: 60, borderRadius: 10 }} />
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={async () => { const p = await takePhoto(); if (p) handleUploadTaskAttachment([p]); }}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, backgroundColor: colors.surfaceRaised }}
                  >
                    <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{t('components.photoGrid.camera')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => { const ps = await pickFromGallery(); if (ps?.length) handleUploadTaskAttachment(ps); }}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, backgroundColor: colors.surfaceRaised }}
                  >
                    <Ionicons name="images-outline" size={18} color={colors.textPrimary} />
                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{t('components.photoGrid.gallery')}</Text>
                  </TouchableOpacity>
                </View>
                {isUploadingTaskAttachment && (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>{t('common.uploading')}</Text>
                )}
              </View>
            )}

            {/* Visit form (notes) — saved to the task thread */}
            {hasCapability(caps, 'form') && (
              <View style={{ marginTop: (hasCapability(caps, 'checklist') || hasCapability(caps, 'photos')) ? 14 : 0 }}>
                <TextInput
                  value={stepNote}
                  onChangeText={setStepNote}
                  placeholder={t('taskDetail.thisStep.visitNotesPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={{ minHeight: 70, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.textPrimary, fontSize: 14, textAlignVertical: 'top' }}
                />
                <TouchableOpacity
                  onPress={handleSaveStepNote}
                  disabled={!stepNote.trim() || savingStepNote}
                  style={{ marginTop: 8, height: 42, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', opacity: (!stepNote.trim() || savingStepNote) ? 0.5 : 1 }}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{savingStepNote ? t('taskDetail.thisStep.savingNote') : t('taskDetail.thisStep.saveNote')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Inline signature */}
            {hasCapability(caps, 'signature') && (
              <View style={{ marginTop: (hasCapability(caps, 'checklist') || hasCapability(caps, 'photos') || hasCapability(caps, 'form')) ? 14 : 0 }}>
                <SignatureCapture
                  title={t('taskDetail.thisStep.signature')}
                  onSave={handleStepSignature}
                  onClear={() => setStepSignature('')}
                  existingSignature={stepSignature}
                />
              </View>
            )}
          </View>
        )}

        {/* Section 3: Info Rows Card */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('taskDetail.details')}</Text>

          {/* Created by */}
          {task.createdBy && (
            <View style={styles.infoRow}>
              <View style={[styles.infoIconCircle, { backgroundColor: colors.surfaceRaised }]}>
                <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{t('taskDetail.infoLabels.createdBy')}</Text>
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
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{t('taskDetail.infoLabels.assignedTo')}</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }, !task.assignedTo && { color: COLORS.warning }]}>
                  {task.assignedTo
                    ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`
                    : t('common.unassigned')}
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
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{t('taskDetail.infoLabels.location')}</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{task.locationAddress}</Text>
                <TouchableOpacity onPress={handleOpenMaps}>
                  <View style={styles.openMapsLink}>
                    <Text style={styles.openMapsText}>{t('taskDetail.openInMaps')}</Text>
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
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('taskDetail.description')}</Text>
            <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>{task.description}</Text>
          </View>
        ) : null}

        {/* Custom Fields — Professional+ only (tier-gated), type-scoped; self-hides when the task type has none */}
        {tierAllows(user?.planTier, 'custom_fields') ? <CustomFieldsCard taskId={task.id} /> : null}

        {/* Section 5: Location Card */}
        {task.locationLat && task.locationLng ? (
          <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('taskDetail.location')}</Text>
            <TouchableOpacity
              style={styles.mapContainer}
              onPress={() => {
                const url = Platform.select({
                  ios: `maps:0,0?q=${task.locationLat},${task.locationLng}`,
                  android: `geo:${task.locationLat},${task.locationLng}?q=${task.locationLat},${task.locationLng}`,
                });
                if (url) Linking.openURL(url);
              }}
              activeOpacity={0.7}
            >
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: task.locationLat,
                  longitude: task.locationLng,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                userInterfaceStyle={isDark ? 'dark' : 'light'}
              >
                <Marker
                  coordinate={{
                    latitude: task.locationLat,
                    longitude: task.locationLng,
                  }}
                  title={task.locationAddress || t('taskDetail.infoLabels.location')}
                />
              </MapView>
            </TouchableOpacity>
            <Text style={[styles.locationAddress, { color: colors.textSecondary }]}>{task.locationAddress}</Text>
            {!isAdmin && [TaskStatus.ASSIGNED, TaskStatus.ACCEPTED, TaskStatus.EN_ROUTE].includes(task.status) && (
              <TouchableOpacity style={styles.navigationButton} onPress={handleStartNavigation}>
                <Ionicons name="navigate" size={20} color="white" />
                <Text style={styles.navigationButtonText}>{t('taskDetail.startNavigation')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Section 6: Attachments */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
          <View style={styles.attachmentsHeader}>
            <Text style={[styles.sectionTitleInline, { color: colors.textMuted }]}>
              {taskAttachments.length > 0 ? t('taskDetail.attachmentsCount', { count: taskAttachments.length }) : t('taskDetail.attachments')}
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
              <Text style={styles.attachmentUploadText}>{t('common.uploading')}</Text>
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
              <Text style={[styles.attachmentEmptyText, { color: colors.textMuted }]}>{t('taskDetail.attachmentActions.noAttachments')}</Text>
              <Text style={[styles.attachmentEmptyHint, { color: colors.textMuted }]}>{t('taskDetail.attachmentActions.tapToAdd')}</Text>
            </View>
          )}
        </View>

        {/* Section 7: Comments */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            {comments.length > 0 ? t('taskDetail.commentsCount', { count: comments.length }) : t('taskDetail.comments')}
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
              <Text style={[styles.commentsEmptyText, { color: colors.textMuted }]}>{t('taskDetail.commentInput.noComments')}</Text>
            </View>
          )}

          <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}>
            <TextInput
              style={[styles.commentInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder={t('taskDetail.commentInput.placeholder')}
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
        <TourTarget name="taskdetail-actions" style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={r.isTablet ? { width: '100%', maxWidth: 720, alignSelf: 'center' } : undefined}>
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
                  {task.assignedToId ? t('taskDetail.adminActions.reassign') : t('taskDetail.adminActions.assign')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[adminDetailStyles.adminActionBtn, { backgroundColor: COLORS.primary }]}
                onPress={handleOpenEdit}
                disabled={isUpdating}
              >
                <Ionicons name="create" size={18} color={COLORS.white} />
                <Text style={[adminDetailStyles.adminActionBtnText, { color: COLORS.white }]}>{t('taskDetail.adminActions.edit')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[adminDetailStyles.adminActionBtn, { borderColor: COLORS.error }]}
                onPress={handleCancelTask}
                disabled={isUpdating}
              >
                <Ionicons name="close-circle" size={18} color={COLORS.error} />
                <Text style={[adminDetailStyles.adminActionBtnText, { color: COLORS.error }]}>{t('taskDetail.adminActions.cancel')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Technician Bottom Bar */
            <>
              {/* Timer for IN_PROGRESS */}
              {showTimer && (
                <View style={styles.timerContainer}>
                  <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
                  <Text style={[styles.timerText, { color: colors.textPrimary }]}>{formatElapsedTime(elapsedTime)}</Text>
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
                      {isTracking ? t('taskDetail.tracking.locationTrackingActive') : t('taskDetail.tracking.startingTracking')}
                    </Text>
                    {isTracking && (
                      <View style={styles.trackingPulse} />
                    )}
                  </View>
                  {locationError && (
                    <TouchableOpacity onPress={() => task && startTracking(task.id)} style={styles.retryTrackingButton}>
                      <Text style={styles.retryTrackingText}>{t('common.retry')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Future Date Banner — shown when task can't be accepted/started yet */}
              {(task.status === TaskStatus.ASSIGNED || task.status === TaskStatus.ACCEPTED) && isFutureTask && (
                <View style={styles.futureDateBanner}>
                  <Ionicons name="calendar-outline" size={20} color={COLORS.amber} />
                  <Text style={styles.futureDateText}>
                    {t('taskDetail.futureTask.scheduledFor', { date: new Date(task.dueDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) })} {task.status === TaskStatus.ASSIGNED ? t('taskDetail.futureTask.canAcceptOnDueDate') : t('taskDetail.futureTask.canStartOnDueDate')}
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
                      <Text style={styles.declineButtonText}>{t('taskDetail.statusActions.declineJob')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.finishButton, { backgroundColor: isFutureTask ? COLORS.slate300 : COLORS.success }]}
                      onPress={() => handleStatusUpdate(TaskStatus.ACCEPTED)}
                      disabled={isUpdating || isFutureTask}
                    >
                      {isUpdating ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <>
                          <Ionicons name={isFutureTask ? 'time-outline' : 'checkmark-circle'} size={20} color="white" />
                          <Text style={styles.finishButtonText}>{isFutureTask ? t('taskDetail.statusActions.scheduledForLater') : t('taskDetail.statusActions.acceptJob')}</Text>
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
                          {(isFutureTask && statusAction.nextStatus === TaskStatus.EN_ROUTE) ? t('taskDetail.statusActions.notYetAvailable') : statusAction.label}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
          </View>
        </TourTarget>
      )}
    </KeyboardAvoidingView>

    <ConfirmSheet
      visible={showStatusConfirm}
      onClose={() => { setShowStatusConfirm(false); setPendingStatus(null); setPendingStatusReason(undefined); }}
      onConfirm={confirmStatusUpdate}
      title={t('taskDetail.updateStatus.confirmTitle')}
      message={pendingStatus ? t('taskDetail.updateStatus.confirmMessage', { status: pendingStatus.replace('_', ' ') }) : ''}
      confirmLabel={t('common.confirm')}
      cancelLabel={t('common.cancel')}
      variant={pendingStatus === 'CANCELED' ? 'danger' : 'info'}
      icon={pendingStatus === 'CANCELED' ? 'close-circle' : 'swap-horizontal'}
    />

    <ConfirmSheet
      visible={showDeclineConfirm}
      onClose={() => setShowDeclineConfirm(false)}
      onConfirm={confirmDeclineTask}
      title={t('taskDetail.declineTask.title')}
      message={t('taskDetail.declineTask.message')}
      confirmLabel={t('taskDetail.declineTask.confirmButton')}
      cancelLabel={t('common.cancel')}
      variant="danger"
    />

    <ConfirmSheet
      visible={showDeleteAttachmentConfirm}
      onClose={() => { setShowDeleteAttachmentConfirm(false); setDeleteAttachmentTarget(null); }}
      onConfirm={confirmDeleteAttachment}
      title={t('taskDetail.attachmentActions.deleteTitle')}
      message={deleteAttachmentTarget ? t('taskDetail.attachmentActions.deleteMessage', { fileName: deleteAttachmentTarget.fileName }) : ''}
      confirmLabel={t('common.delete')}
      cancelLabel={t('common.cancel')}
      variant="danger"
    />

    <ConfirmSheet
      visible={showCancelTaskConfirm}
      onClose={() => setShowCancelTaskConfirm(false)}
      onConfirm={confirmCancelTask}
      title={t('taskDetail.cancelTask.title')}
      message={t('taskDetail.cancelTask.message')}
      confirmLabel={t('taskDetail.cancelTask.confirmButton')}
      cancelLabel={t('common.no')}
      variant="danger"
    />
    </>
  );
}

// Route entry: reads the id from the URL and renders the pane as a full-screen sheet.
export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskDetailPane taskId={id!} />;
}

