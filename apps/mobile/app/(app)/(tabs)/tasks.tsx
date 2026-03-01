import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../../src/contexts/auth-context';
import { tasksApi, type Task } from '../../../src/lib/api';
import { TaskCard, FilterChip } from '../../../src/components';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ROUTES,
} from '../../../src/lib/constants';

// Filter options for technicians
const TECH_FILTER_OPTIONS = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'BLOCKED', label: 'Blocked' },
] as const;

// Filter options for admin (more granular)
const ADMIN_FILTER_OPTIONS = [
  { key: 'ALL', label: 'All' },
  { key: 'NEW', label: 'New' },
  { key: 'ASSIGNED', label: 'Assigned' },
  { key: 'IN_PROGRESS', label: 'Active' },
  { key: 'COMPLETED', label: 'Done' },
  { key: 'BLOCKED', label: 'Blocked' },
] as const;

type FilterKey = string;

export default function TasksScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'CLIENT';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [search, setSearch] = useState('');

  const initialFetchDoneRef = useRef(false);
  const fetchingRef = useRef(false);

  const filterOptions = isAdmin ? ADMIN_FILTER_OPTIONS : TECH_FILTER_OPTIONS;

  const fetchTasks = useCallback(async (showRefresh = false) => {
    if (fetchingRef.current && !showRefresh) return;

    try {
      fetchingRef.current = true;
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const fetchedTasks = await tasksApi.list();
      setTasks(fetchedTasks || []);
    } catch (err: any) {
      if (err?.statusCode === 401 || err?.message?.includes('Session expired')) {
        return;
      }
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

  const handleRefresh = () => fetchTasks(true);

  const handleTaskPress = (task: Task) => {
    router.push(ROUTES.taskDetail(task.id));
  };

  // Filter tasks based on selected filter and search
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Apply status filter
    if (filter !== 'ALL') {
      if (filter === 'ACTIVE' || filter === 'IN_PROGRESS') {
        result = result.filter(task =>
          ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(task.status)
        );
      } else if (filter === 'NEW') {
        result = result.filter(task => task.status === 'NEW');
      } else if (filter === 'ASSIGNED') {
        result = result.filter(task =>
          ['ASSIGNED', 'ACCEPTED'].includes(task.status)
        );
      } else if (filter === 'COMPLETED') {
        result = result.filter(task =>
          ['COMPLETED', 'CLOSED'].includes(task.status)
        );
      } else if (filter === 'BLOCKED') {
        result = result.filter(task => task.status === 'BLOCKED');
      }
    }

    // Apply search (client-side)
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(task =>
        task.title.toLowerCase().includes(q) ||
        (task.description && task.description.toLowerCase().includes(q)) ||
        (task.assignedTo && `${task.assignedTo.firstName} ${task.assignedTo.lastName}`.toLowerCase().includes(q))
      );
    }

    return result;
  }, [tasks, filter, search]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchTasks()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar (admin only) */}
      {isAdmin && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={COLORS.slate400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tasks..."
            placeholderTextColor={COLORS.slate400}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.slate400} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <FlatList
          data={filterOptions as readonly { key: string; label: string }[]}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <FilterChip
              label={item.label}
              active={filter === item.key}
              onPress={() => setFilter(item.key)}
            />
          )}
          contentContainerStyle={{ gap: SPACING.sm }}
        />
      </View>

      {/* Tasks Count */}
      <View style={styles.countContainer}>
        <Text style={styles.countText}>{filteredTasks.length} tasks</Text>
      </View>

      {/* Tasks List */}
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onPress={() => handleTaskPress(item)}
            showAssignee={isAdmin}
            showPriority={isAdmin}
            showDate
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="clipboard-outline" size={48} color={COLORS.slate300} />
            <Text style={styles.emptyText}>No tasks found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.slate50,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxxl,
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
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.slate200,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    fontSize: FONT_SIZE.base,
    color: COLORS.slate800,
  },

  // Filter
  filterContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },

  // Count
  countContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  countText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.slate400,
    fontWeight: FONT_WEIGHT.medium,
  },

  // List
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl + SPACING.lg,
  },
  emptyText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.slate400,
    marginTop: SPACING.md,
  },
});
