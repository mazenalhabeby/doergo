import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/theme-context';
import { COLORS } from '../../../lib/constants';
import { BottomSheet } from './bottom-sheet';
import { Avatar } from './avatar';
import type { DotColor } from './helpers';

export interface LiveEvent {
  id: string;
  dot: DotColor;
  name: string;
  action: string;
  subject: string;
  time: string;
}

export interface PendingActionItem {
  id: string;
  userId?: string;
  initials: string;
  imageUrl?: string | null;
  title: string;
  description: string;
  taskId: string;
  canReject?: boolean;
}

const DOT_COLORS: Record<DotColor, string> = {
  green: '#10b981',
  blue: '#3b82f6',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  events: LiveEvent[];
  pending: PendingActionItem[];
  onOpenTask: (taskId: string) => void;
  onResolvePending?: (id: string) => void;
}

export function ActivitySheet({ visible, onClose, events, pending, onOpenTask, onResolvePending }: Props) {
  const { colors } = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} heightRatio={0.72}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Live Activity */}
        <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>LIVE ACTIVITY</Text>
          {events.length > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.badgeText, { color: COLORS.primary }]}>{events.length} events</Text>
            </View>
          )}
        </View>

        {events.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>No recent activity</Text>
        ) : (
          events.map((e) => (
            <View key={e.id} style={[styles.eventRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.eventDot, { backgroundColor: DOT_COLORS[e.dot] }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.eventMsg, { color: colors.textMuted }]}>
                  <Text style={[styles.eventStrong, { color: colors.textPrimary }]}>{e.name}</Text>
                  {` ${e.action} `}
                  <Text style={[styles.eventStrong, { color: colors.textPrimary }]}>{e.subject}</Text>
                </Text>
                <Text style={[styles.eventTime, { color: colors.textMuted }]}>{e.time}</Text>
              </View>
            </View>
          ))
        )}

        {/* Pending Actions */}
        {pending.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { borderBottomColor: colors.border, marginTop: 18 }]}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PENDING ACTIONS</Text>
              <View style={[styles.badge, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <Text style={[styles.badgeText, { color: '#f59e0b' }]}>{pending.length}</Text>
              </View>
            </View>

            {pending.map((p) => (
              <View key={p.id} style={[styles.pendRow, { borderBottomColor: colors.border }]}>
                <Avatar id={p.userId || p.id} initials={p.initials} imageUrl={p.imageUrl} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.pendTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={[styles.pendDesc, { color: colors.textMuted }]} numberOfLines={1}>
                    {p.description}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: 'rgba(16,185,129,0.12)' }]}
                  onPress={() => onOpenTask(p.taskId)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-forward" size={15} color="#10b981" />
                </TouchableOpacity>
                {p.canReject && onResolvePending && (
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: 'rgba(239,68,68,0.12)' }]}
                    onPress={() => onResolvePending(p.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={15} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 9,
    borderBottomWidth: 1,
  },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  empty: { fontSize: 12, textAlign: 'center', paddingVertical: 20 },
  eventRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  eventDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  eventMsg: { fontSize: 12, lineHeight: 17 },
  eventStrong: { fontWeight: '600' },
  eventTime: { fontSize: 10, marginTop: 2, opacity: 0.7 },
  pendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  pendTitle: { fontSize: 12, fontWeight: '600' },
  pendDesc: { fontSize: 10, marginTop: 1 },
  iconBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
