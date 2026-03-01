/**
 * Reusable Task Card Component
 * Used in both the home screen (Today's Jobs) and tasks list screen
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '../lib/constants';
import { getStatusStyle, getPriorityStyle } from '../lib/styles';
import { formatTimeRange, formatRelativeDate } from '../lib/utils';

// Task type definition
export interface TaskCardData {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string;
  locationAddress?: string;
  createdBy?: {
    firstName: string;
    lastName: string;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  organization?: {
    name: string;
  };
}

interface TaskCardProps {
  task: TaskCardData;
  onPress: () => void;
  showPriority?: boolean;
  showDate?: boolean;
  showAssignee?: boolean;
  compact?: boolean;
}

/**
 * TaskCard - A reusable card component for displaying task information
 *
 * @param task - The task data to display
 * @param onPress - Callback when card is pressed
 * @param showPriority - Whether to show priority indicator (default: false)
 * @param showDate - Whether to show relative date instead of time (default: false)
 * @param compact - Use compact styling (default: false)
 */
export function TaskCard({
  task,
  onPress,
  showPriority = false,
  showDate = false,
  showAssignee = false,
  compact = false,
}: TaskCardProps) {
  const statusStyle = getStatusStyle(task.status);
  const priorityStyle = task.priority ? getPriorityStyle(task.priority) : null;

  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.cardCompact]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Header: Title + Status Badge */}
      <View style={styles.header}>
        <View style={styles.titleSection}>
          <View style={styles.titleRow}>
            {showPriority && priorityStyle && (
              <View style={[styles.priorityDot, { backgroundColor: priorityStyle.color }]} />
            )}
            <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>
              {task.title}
            </Text>
          </View>
          {task.createdBy && (
            <Text style={styles.subtitle}>
              {task.createdBy.firstName} {task.createdBy.lastName}
            </Text>
          )}
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusStyle.bg, borderColor: statusStyle.border },
          ]}
        >
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {statusStyle.label}
          </Text>
        </View>
      </View>

      {/* Location */}
      {task.locationAddress && (
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={16} color={COLORS.slate400} />
          <Text style={styles.infoText} numberOfLines={1}>
            {task.locationAddress}
          </Text>
        </View>
      )}

      {/* Time/Date */}
      {task.dueDate && (
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={16} color={COLORS.slate400} />
          <Text style={styles.infoText}>
            {showDate ? formatRelativeDate(task.dueDate) : formatTimeRange(task.dueDate)}
          </Text>
        </View>
      )}

      {/* Assignee */}
      {showAssignee && (
        <View style={styles.infoRow}>
          <Ionicons
            name="person-outline"
            size={16}
            color={task.assignedTo ? COLORS.slate400 : COLORS.warning}
          />
          <Text
            style={[
              styles.infoText,
              !task.assignedTo && { color: COLORS.warning, fontWeight: FONT_WEIGHT.medium },
            ]}
          >
            {task.assignedTo
              ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`
              : 'Unassigned'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  cardCompact: {
    padding: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  titleSection: {
    flex: 1,
    marginRight: SPACING.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
    flex: 1,
  },
  titleCompact: {
    fontSize: FONT_SIZE.base,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
    marginTop: 2,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  statusText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
    flex: 1,
  },
});

export default TaskCard;
