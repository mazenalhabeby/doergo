import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/theme-context';
import { useToast } from '../../../contexts/toast-context';
import { COLORS } from '../../../lib/constants';
import { techniciansApi, type Task } from '../../../lib/api';
import { BottomSheet } from './bottom-sheet';
import { Avatar } from './avatar';
import type { WorkerStatus } from './helpers';

export interface MemberSummary {
  userId: string;
  name: string;
  initials: string;
  imageUrl?: string | null;
  position?: string | null;
  email?: string | null;
  status: WorkerStatus;
}

interface Props {
  visible: boolean;
  member: MemberSummary | null;
  /** Member's active tasks — passed from already-loaded dashboard data (no extra fetch). */
  activeTasks: Task[];
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  onViewTasks: () => void;
  onProfile: () => void;
}

const TASK_STATUS: Record<string, { label: string; color: string }> = {
  IN_PROGRESS: { label: 'Working', color: '#f59e0b' },
  EN_ROUTE: { label: 'En Route', color: '#3b82f6' },
  ARRIVED: { label: 'On Site', color: '#10b981' },
  BLOCKED: { label: 'Blocked', color: '#ef4444' },
  ASSIGNED: { label: 'Assigned', color: '#8b5cf6' },
  ACCEPTED: { label: 'Accepted', color: '#10b981' },
};

export function MemberDetailSheet({
  visible,
  member,
  activeTasks,
  onClose,
  onOpenTask,
  onViewTasks,
  onProfile,
}: Props) {
  const { colors } = useTheme();
  const toast = useToast();
  const [detail, setDetail] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Lazily fetch ONLY the stats when the sheet opens (name/avatar/tasks are
  // already provided by the dashboard — no redundant fetching).
  useEffect(() => {
    if (!visible || !member) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingStats(true);
    techniciansApi
      .getById(member.userId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setLoadingStats(false); });
    return () => { cancelled = true; };
  }, [visible, member?.userId]);

  const stats = (detail as any)?.stats;
  const completed = stats?.tasks?.completed ?? (detail as any)?.completedTaskCount;
  const hoursWeek = stats?.attendance?.hoursThisWeek;
  const onTimeRate = stats?.performance?.onTimeRate;

  const soon = (label: string) => toast.info(`${label} coming soon`);

  return (
    <BottomSheet visible={visible} onClose={onClose} dynamicHeight heightRatio={0.9}>
      {!member ? null : (
        <View style={{ paddingBottom: 12 }}>
          {/* Header */}
          <View style={styles.header}>
            <Avatar
              id={member.userId}
              initials={member.initials}
              imageUrl={member.imageUrl}
              status={member.status}
              ringColor={colors.surface}
              size={56}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                {member.name}
              </Text>
              <View style={styles.metaRow}>
                <Ionicons name="briefcase-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {member.position || 'Employee'}
                </Text>
              </View>
              {!!member.email && (
                <View style={styles.metaRow}>
                  <Ionicons name="mail-outline" size={12} color={colors.textMuted} />
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                    {member.email}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.quickActions}>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: COLORS.primary }]} onPress={() => soon('Messaging')} activeOpacity={0.8}>
                <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.surfaceRaised }]} onPress={() => soon('Calls')} activeOpacity={0.8}>
                <Ionicons name="call" size={15} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatCard colors={colors} icon="checkmark-circle" iconColor="#10b981" value={fmt(completed, loadingStats)} label="Completed" />
            <StatCard colors={colors} icon="list" iconColor="#3b82f6" value={String(activeTasks.length)} label="Active" />
            <StatCard colors={colors} icon="time" iconColor="#f59e0b" value={hoursWeek != null ? `${Math.round(hoursWeek)}h` : fmt(undefined, loadingStats)} label="Hrs/Week" />
            <StatCard colors={colors} icon="trending-up" iconColor="#8b5cf6" value={onTimeRate != null ? `${Math.round(onTimeRate)}%` : fmt(undefined, loadingStats)} label="On-Time" />
          </View>

          {/* Active tasks */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACTIVE TASKS</Text>
              {activeTasks.length > 0 && (
                <TouchableOpacity onPress={onViewTasks} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.viewAll, { color: COLORS.primary }]}>View all ›</Text>
                </TouchableOpacity>
              )}
            </View>

            {activeTasks.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="clipboard-outline" size={22} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No active tasks</Text>
              </View>
            ) : (
              activeTasks.slice(0, 4).map((task) => {
                const cfg = TASK_STATUS[task.status] || { label: task.status, color: colors.textMuted };
                return (
                  <TouchableOpacity
                    key={task.id}
                    style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => onOpenTask(task.id)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.taskTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {task.title}
                      </Text>
                      {!!task.locationAddress && (
                        <View style={styles.metaRow}>
                          <Ionicons name="location-outline" size={11} color={colors.textMuted} />
                          <Text style={[styles.taskLoc, { color: colors.textMuted }]} numberOfLines={1}>
                            {task.locationAddress}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: cfg.color + '22' }]}>
                      <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
                      <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {/* Bottom actions */}
          <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
            <TouchableOpacity style={styles.bottomBtn} onPress={onProfile} activeOpacity={0.7}>
              <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.bottomText, { color: colors.textSecondary }]}>Profile</Text>
            </TouchableOpacity>
            <View style={[styles.bottomDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.bottomBtn} onPress={onViewTasks} activeOpacity={0.7}>
              <Ionicons name="list-outline" size={16} color={COLORS.primary} />
              <Text style={[styles.bottomText, { color: COLORS.primary }]}>Tasks</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

function fmt(value: number | undefined, loading: boolean): string {
  if (value != null) return String(value);
  return loading ? '·' : '—';
}

function StatCard({
  colors, icon, iconColor, value, label,
}: { colors: any; icon: any; iconColor: string; value: string; label: string }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name={icon} size={15} color={iconColor} />
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  name: { fontSize: 18, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  meta: { fontSize: 12, flexShrink: 1 },
  quickActions: { flexDirection: 'row', gap: 7 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 9.5, fontWeight: '500' },
  section: { marginBottom: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  viewAll: { fontSize: 11, fontWeight: '600' },
  empty: { borderWidth: 1, borderRadius: 12, paddingVertical: 22, alignItems: 'center', gap: 6 },
  emptyText: { fontSize: 13 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  taskTitle: { fontSize: 14, fontWeight: '600' },
  taskLoc: { fontSize: 11, flexShrink: 1 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  bottomBar: { flexDirection: 'row', borderTopWidth: 1, marginTop: 8 },
  bottomBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13 },
  bottomText: { fontSize: 13, fontWeight: '600' },
  bottomDivider: { width: 1 },
});
