import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../../src/contexts/auth-context';
import { tasksApi, type Task } from '../../../src/lib/api';

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

// Priority colors
const priorityColors: Record<string, string> = {
  LOW: '#64748b',
  MEDIUM: '#3b82f6',
  HIGH: '#f97316',
  URGENT: '#dc2626',
};

function TaskCard({ task, onPress }: { task: Task; onPress: () => void }) {
  const statusStyle = statusColors[task.status] || statusColors.NEW;
  const priorityColor = priorityColors[task.priority] || priorityColors.MEDIUM;

  return (
    <TouchableOpacity style={styles.taskCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.taskHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {task.status.replace('_', ' ')}
          </Text>
        </View>
        <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
      </View>

      <Text style={styles.taskTitle} numberOfLines={2}>
        {task.title}
      </Text>

      {task.description && (
        <Text style={styles.taskDescription} numberOfLines={2}>
          {task.description}
        </Text>
      )}

      {task.locationAddress && (
        <View style={styles.taskLocation}>
          <Ionicons name="location-outline" size={14} color="#64748b" />
          <Text style={styles.locationText} numberOfLines={1}>
            {task.locationAddress}
          </Text>
        </View>
      )}

      {task.dueDate && (
        <View style={styles.taskDueDate}>
          <Ionicons name="calendar-outline" size={14} color="#64748b" />
          <Text style={styles.dueDateText}>
            Due: {new Date(task.dueDate).toLocaleDateString()}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function TasksScreen() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref to prevent duplicate initial fetches (React 18 StrictMode)
  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);

  const fetchTasks = useCallback(async (showRefresh = false) => {
    // Prevent duplicate concurrent fetches
    if (fetchingRef.current && !showRefresh) {
      console.log('[TasksList] Fetch already in progress, skipping');
      return;
    }

    try {
      fetchingRef.current = true;
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      console.log('[TasksList] Fetching tasks, isRefresh:', showRefresh);

      // API handles auth internally with automatic 401 refresh
      const tasks = await tasksApi.list();
      setTasks(tasks || []);
    } catch (err: any) {
      // Don't show error for session expiry - app will redirect to login
      if (err?.statusCode === 401 || err?.message?.includes('Session expired')) {
        console.log('[TasksList] Session expired, redirecting to login...');
        return;
      }
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Prevent StrictMode double-fetch on initial mount
    if (initialFetchDoneRef.current) {
      console.log('[TasksList] Initial fetch already done, skipping');
      return;
    }
    initialFetchDoneRef.current = true;
    fetchTasks();
  }, [fetchTasks]);

  const handleRefresh = () => {
    fetchTasks(true);
  };

  const handleTaskPress = (task: Task) => {
    router.push(`/task/${task.id}`);
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeContent}>
            <Text style={styles.welcomeGreeting}>
              Hello, {user?.firstName || 'Worker'}!
            </Text>
            <Text style={styles.welcomeSubtitle}>Loading your tasks...</Text>
          </View>
          <ActivityIndicator size="small" color={PRIMARY_COLOR} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeContent}>
            <Text style={styles.welcomeGreeting}>
              Hello, {user?.firstName || 'Worker'}!
            </Text>
            <Text style={styles.welcomeSubtitle}>Something went wrong</Text>
          </View>
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#dc2626" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchTasks()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Empty state
  if (tasks.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeContent}>
            <Text style={styles.welcomeGreeting}>
              Hello, {user?.firstName || 'Worker'}!
            </Text>
            <Text style={styles.welcomeSubtitle}>Ready for today's tasks?</Text>
          </View>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={24} color={PRIMARY_COLOR} />
          </View>
        </View>

        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="clipboard-outline" size={48} color="#cbd5e1" />
          </View>
          <Text style={styles.emptyTitle}>No tasks yet</Text>
          <Text style={styles.emptySubtitle}>
            Tasks assigned to you will appear here
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          activeOpacity={0.8}
          onPress={handleRefresh}
        >
          <Ionicons name="refresh" size={20} color="white" />
          <Text style={styles.refreshButtonText}>Refresh Tasks</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Tasks list
  return (
    <View style={styles.container}>
      <View style={styles.welcomeCard}>
        <View style={styles.welcomeContent}>
          <Text style={styles.welcomeGreeting}>
            Hello, {user?.firstName || 'Worker'}!
          </Text>
          <Text style={styles.welcomeSubtitle}>
            You have {tasks.length} task{tasks.length !== 1 ? 's' : ''} assigned
          </Text>
        </View>
        <View style={styles.avatarContainer}>
          <Ionicons name="person" size={24} color={PRIMARY_COLOR} />
        </View>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TaskCard task={item} onPress={() => handleTaskPress(item)} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[PRIMARY_COLOR]}
            tintColor={PRIMARY_COLOR}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  welcomeCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  welcomeContent: {
    flex: 1,
  },
  welcomeGreeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
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
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  refreshButton: {
    flexDirection: 'row',
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  listContent: {
    paddingBottom: 16,
  },
  taskCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  taskDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
    lineHeight: 20,
  },
  taskLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  locationText: {
    fontSize: 13,
    color: '#64748b',
    flex: 1,
  },
  taskDueDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  dueDateText: {
    fontSize: 13,
    color: '#64748b',
  },
});
