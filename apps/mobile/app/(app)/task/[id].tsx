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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { tasksApi, type Task, type Comment } from '../../../src/lib/api';

const PRIMARY_COLOR = '#2563EB';

// Status colors
const statusColors: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: '#f1f5f9', text: '#475569' },
  NEW: { bg: '#dbeafe', text: '#1d4ed8' },
  ASSIGNED: { bg: '#f3e8ff', text: '#7c3aed' },
  IN_PROGRESS: { bg: '#fef3c7', text: '#b45309' },
  BLOCKED: { bg: '#fee2e2', text: '#dc2626' },
  COMPLETED: { bg: '#dcfce7', text: '#16a34a' },
  CANCELED: { bg: '#f1f5f9', text: '#64748b' },
  CLOSED: { bg: '#f8fafc', text: '#94a3b8' },
};

// Priority labels
const priorityLabels: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Low', color: '#64748b' },
  MEDIUM: { label: 'Medium', color: '#3b82f6' },
  HIGH: { label: 'High', color: '#f97316' },
  URGENT: { label: 'Urgent', color: '#dc2626' },
};

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);

  // Ref to prevent duplicate fetches (React 18 StrictMode runs effects twice)
  const fetchingRef = useRef(false);
  const lastFetchedIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Prevent duplicate fetches (React 18 StrictMode runs effects twice)
    if (!id || fetchingRef.current) {
      console.log('[TaskDetail] Skipping fetch - no id or already fetching');
      return;
    }

    // Skip if we've already fetched this exact ID
    if (lastFetchedIdRef.current === id) {
      console.log('[TaskDetail] Already fetched this task, skipping');
      return;
    }

    const fetchData = async () => {
      try {
        fetchingRef.current = true;
        setIsLoading(true);
        setError(null);

        console.log('[TaskDetail] Fetching task:', id);

        // API handles auth internally with automatic 401 refresh
        const [taskResponse, commentsResponse] = await Promise.all([
          tasksApi.getById(id),
          tasksApi.getComments(id),
        ]);

        setTask(taskResponse);
        setComments(commentsResponse);
        lastFetchedIdRef.current = id;
      } catch (err: any) {
        // Don't show error for session expiry - app will redirect to login
        if (err?.statusCode === 401 || err?.message?.includes('Session expired')) {
          console.log('[TaskDetail] Session expired, redirecting to login...');
          return;
        }
        console.error('Error fetching task:', err);
        setError(err instanceof Error ? err.message : 'Failed to load task');
      } finally {
        setIsLoading(false);
        fetchingRef.current = false;
      }
    };

    fetchData();
  }, [id]);

  // Handle retry - reset refs and trigger refetch
  const handleRetry = useCallback(() => {
    lastFetchedIdRef.current = null;
    fetchingRef.current = false;
    // Force a re-render to trigger the useEffect
    setError(null);
    setIsLoading(true);
    // Manually trigger fetch since refs are reset
    const fetchData = async () => {
      try {
        fetchingRef.current = true;
        console.log('[TaskDetail] Retry fetching task:', id);

        const [taskResponse, commentsResponse] = await Promise.all([
          tasksApi.getById(id!),
          tasksApi.getComments(id!),
        ]);

        setTask(taskResponse);
        setComments(commentsResponse);
        lastFetchedIdRef.current = id!;
      } catch (err: any) {
        if (err?.statusCode === 401 || err?.message?.includes('Session expired')) {
          console.log('[TaskDetail] Session expired, redirecting to login...');
          return;
        }
        console.error('Error fetching task:', err);
        setError(err instanceof Error ? err.message : 'Failed to load task');
      } finally {
        setIsLoading(false);
        fetchingRef.current = false;
      }
    };
    fetchData();
  }, [id]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!task) return;

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
              const updatedTask = await tasksApi.updateStatus(task.id, newStatus);
              setTask(updatedTask);
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update status');
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !task) return;

    try {
      setIsAddingComment(true);
      const comment = await tasksApi.addComment(task.id, newComment.trim());
      setComments([comment, ...comments]);
      setNewComment('');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setIsAddingComment(false);
    }
  };

  // Get available status actions based on current status
  const getAvailableActions = () => {
    if (!task) return [];

    switch (task.status) {
      case 'ASSIGNED':
        return [{ status: 'IN_PROGRESS', label: 'Start Task', icon: 'play' as const, color: '#16a34a' }];
      case 'IN_PROGRESS':
        return [
          { status: 'BLOCKED', label: 'Report Issue', icon: 'warning' as const, color: '#dc2626' },
          { status: 'COMPLETED', label: 'Complete', icon: 'checkmark-circle' as const, color: '#16a34a' },
        ];
      case 'BLOCKED':
        return [{ status: 'IN_PROGRESS', label: 'Resume', icon: 'play' as const, color: '#16a34a' }];
      default:
        return [];
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
      </View>
    );
  }

  if (error || !task) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ title: 'Error' }} />
        <Ionicons name="alert-circle-outline" size={48} color="#dc2626" />
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

  const statusStyle = statusColors[task.status] || statusColors.NEW;
  const priority = priorityLabels[task.priority] || priorityLabels.MEDIUM;
  const actions = getAvailableActions();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Task Details' }} />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Status & Priority */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {task.status.replace('_', ' ')}
            </Text>
          </View>
          <View style={styles.priorityBadge}>
            <View style={[styles.priorityDot, { backgroundColor: priority.color }]} />
            <Text style={[styles.priorityText, { color: priority.color }]}>
              {priority.label} Priority
            </Text>
          </View>
        </View>

        {/* Title & Description */}
        <Text style={styles.title}>{task.title}</Text>
        {task.description && (
          <Text style={styles.description}>{task.description}</Text>
        )}

        {/* Info Cards */}
        <View style={styles.infoCard}>
          {task.locationAddress && (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={20} color="#64748b" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>{task.locationAddress}</Text>
              </View>
            </View>
          )}

          {task.dueDate && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color="#64748b" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Due Date</Text>
                <Text style={styles.infoValue}>
                  {new Date(task.dueDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            </View>
          )}

          {task.createdBy && (
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={20} color="#64748b" />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Created By</Text>
                <Text style={styles.infoValue}>
                  {task.createdBy.firstName} {task.createdBy.lastName}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        {actions.length > 0 && (
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <View style={styles.actionButtons}>
              {actions.map((action) => (
                <TouchableOpacity
                  key={action.status}
                  style={[styles.actionButton, { backgroundColor: action.color }]}
                  onPress={() => handleStatusUpdate(action.status)}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Ionicons name={action.icon} size={20} color="white" />
                      <Text style={styles.actionButtonText}>{action.label}</Text>
                    </>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Comments Section */}
        <View style={styles.commentsSection}>
          <Text style={styles.sectionTitle}>Comments ({comments.length})</Text>

          {/* Add Comment */}
          <View style={styles.addCommentContainer}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              value={newComment}
              onChangeText={setNewComment}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!newComment.trim() || isAddingComment) && styles.sendButtonDisabled,
              ]}
              onPress={handleAddComment}
              disabled={!newComment.trim() || isAddingComment}
            >
              {isAddingComment ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="send" size={18} color="white" />
              )}
            </TouchableOpacity>
          </View>

          {/* Comments List */}
          {comments.length === 0 ? (
            <Text style={styles.noComments}>No comments yet</Text>
          ) : (
            comments.map((comment) => (
              <View key={comment.id} style={styles.commentCard}>
                <View style={styles.commentHeader}>
                  <Text style={styles.commentAuthor}>
                    {comment.user.firstName} {comment.user.lastName}
                  </Text>
                  <Text style={styles.commentDate}>
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.commentContent}>{comment.content}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f8fafc',
  },
  errorText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButtonText: {
    color: PRIMARY_COLOR,
    fontSize: 16,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 14,
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#64748b',
    lineHeight: 24,
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '500',
  },
  actionsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'white',
  },
  commentsSection: {
    marginBottom: 32,
  },
  addCommentContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 16,
  },
  commentInput: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 48,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sendButton: {
    backgroundColor: PRIMARY_COLOR,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  noComments: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 14,
    paddingVertical: 24,
  },
  commentCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  commentDate: {
    fontSize: 12,
    color: '#94a3b8',
  },
  commentContent: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
});
