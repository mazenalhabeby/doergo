import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { tasksApi, TaskStatus, type Task } from '../../lib/api';
import { TaskCard, LoadingState, ErrorState } from '../../components';
import { ROUTES } from '../../lib/constants';
import { styles, COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOWS } from './home-styles';

export function AdminDashboard() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);

  const stats = useMemo(() => {
    return {
      total: tasks.length,
      inProgress: tasks.filter(t =>
        [TaskStatus.IN_PROGRESS, TaskStatus.EN_ROUTE, TaskStatus.ARRIVED].includes(t.status)
      ).length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CLOSED).length,
      pending: tasks.filter(t =>
        [TaskStatus.NEW, TaskStatus.ASSIGNED, TaskStatus.ACCEPTED].includes(t.status)
      ).length,
    };
  }, [tasks]);

  const recentTasks = useMemo(() => {
    return [...tasks]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [tasks]);

  const fetchTasks = useCallback(async (showRefresh = false) => {
    if (fetchingRef.current && !showRefresh) return;
    try {
      fetchingRef.current = true;
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);
      const fetchedTasks = await tasksApi.list();
      setTasks(fetchedTasks || []);
    } catch (err: any) {
      if (err?.statusCode === 401 || err?.message?.includes('Session expired')) return;
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    fetchTasks();
  }, [fetchTasks]);

  // Refetch when screen regains focus (e.g. navigating back from task detail)
  useFocusEffect(
    useCallback(() => {
      if (!initialFetchDoneRef.current) return;
      fetchTasks();
    }, [fetchTasks])
  );

  const handleTaskPress = (task: Task) => {
    router.push(ROUTES.taskDetail(task.id));
  };

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={() => fetchTasks()} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchTasks(true)}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Welcome */}
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeGreeting, { color: colors.textMuted }]}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},
          </Text>
          <Text style={[styles.welcomeName, { color: colors.textPrimary }]}>{user?.firstName}!</Text>
        </View>

        {/* Stat Cards */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="list" size={18} color={COLORS.primary} />
              </View>
              <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{stats.total}</Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total Tasks</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: colors.amberLight }]}>
                <Ionicons name="play-circle" size={18} color={COLORS.amber} />
              </View>
              <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{stats.inProgress}</Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>In Progress</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: colors.successLight }]}>
                <Ionicons name="checkmark-done" size={18} color={COLORS.success} />
              </View>
              <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{stats.completed}</Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Completed</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <View style={styles.statRow}>
              <View style={[styles.statIcon, { backgroundColor: colors.purpleLight }]}>
                <Ionicons name="hourglass-outline" size={18} color={COLORS.purple} />
              </View>
              <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{stats.pending}</Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Pending</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={adminStyles.quickActions}>
          <TouchableOpacity
            style={adminStyles.quickActionButton}
            onPress={() => router.push(ROUTES.createTask)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={20} color={COLORS.white} />
            <Text style={adminStyles.quickActionText}>Create Task</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[adminStyles.quickActionButton, adminStyles.quickActionSecondary, { backgroundColor: colors.card, borderColor: COLORS.primary }]}
            onPress={() => router.push(ROUTES.tasks)}
            activeOpacity={0.7}
          >
            <Ionicons name="clipboard" size={20} color={COLORS.primary} />
            <Text style={adminStyles.quickActionSecondaryText}>View All</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Tasks */}
        <View style={adminStyles.recentSection}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Tasks</Text>
          {recentTasks.length === 0 ? (
            <View style={[adminStyles.emptyRecent, { backgroundColor: colors.card }]}>
              <Text style={[adminStyles.emptyRecentText, { color: colors.textMuted }]}>No tasks yet. Create one to get started!</Text>
            </View>
          ) : (
            <View style={adminStyles.recentList}>
              {recentTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onPress={() => handleTaskPress(task)}
                  showAssignee
                  showPriority
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </View>
  );
}

const adminStyles = StyleSheet.create({
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    gap: SPACING.md,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  quickActionSecondary: {
    borderWidth: 1,
  },
  quickActionText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  quickActionSecondaryText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  },
  recentSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xxl,
  },
  recentList: {
    gap: SPACING.md,
  },
  emptyRecent: {
    borderRadius: RADIUS.md,
    padding: SPACING.xxxl,
    alignItems: 'center',
  },
  emptyRecentText: {
    fontSize: FONT_SIZE.base,
    textAlign: 'center',
  },
});
