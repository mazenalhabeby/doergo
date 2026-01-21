import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../../src/lib/constants';
import { getTimeOffStatusStyle } from '../../../src/lib/styles';
import { formatShortDate } from '../../../src/lib/utils';

// Mock data for time off requests
const MOCK_TIME_OFF_REQUESTS = [
  {
    id: '1',
    type: 'Vacation',
    startDate: '2026-01-25',
    endDate: '2026-01-28',
    status: 'APPROVED',
    days: 4,
  },
  {
    id: '2',
    type: 'Sick Leave',
    startDate: '2026-02-10',
    endDate: '2026-02-10',
    status: 'PENDING',
    days: 1,
  },
  {
    id: '3',
    type: 'Personal',
    startDate: '2026-02-15',
    endDate: '2026-02-16',
    status: 'PENDING',
    days: 2,
  },
] as const;

export default function TimeOffScreen() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [requests] = useState(MOCK_TIME_OFF_REQUESTS);

  // Calculate stats
  const stats = {
    approved: requests.filter(r => r.status === 'APPROVED').length,
    pending: requests.filter(r => r.status === 'PENDING').length,
    used: 5,
    remaining: 8,
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.success }]}>{stats.approved}</Text>
            <Text style={styles.statLabel}>Approved</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.warning }]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.primary }]}>{stats.used}</Text>
            <Text style={styles.statLabel}>Used</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.slate400 }]}>{stats.remaining}</Text>
            <Text style={styles.statLabel}>Left</Text>
          </View>
        </View>

        {/* Request Button */}
        <TouchableOpacity style={styles.requestButton}>
          <Ionicons name="add-circle-outline" size={20} color={COLORS.white} />
          <Text style={styles.requestButtonText}>Request Time Off</Text>
        </TouchableOpacity>

        {/* Requests List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Requests</Text>

          {requests.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={COLORS.slate300} />
              <Text style={styles.emptyText}>No time off requests yet</Text>
            </View>
          ) : (
            requests.map(request => {
              const statusStyle = getTimeOffStatusStyle(request.status);
              return (
                <View key={request.id} style={[styles.requestCard, { borderLeftColor: statusStyle.text }]}>
                  <View style={styles.requestHeader}>
                    <View style={styles.requestType}>
                      <Ionicons
                        name={request.type === 'Sick Leave' ? 'medkit-outline' : 'sunny-outline'}
                        size={20}
                        color={COLORS.primary}
                      />
                      <Text style={styles.requestTypeText}>{request.type}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
                      <Text style={[styles.statusText, { color: statusStyle.text }]}>
                        {statusStyle.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.requestDetails}>
                    <View style={styles.detailRow}>
                      <Ionicons name="calendar-outline" size={16} color={COLORS.slate400} />
                      <Text style={styles.detailText}>
                        {formatShortDate(request.startDate)}
                        {request.startDate !== request.endDate && ` - ${formatShortDate(request.endDate)}`}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Ionicons name="time-outline" size={16} color={COLORS.slate400} />
                      <Text style={styles.detailText}>{request.days} day{request.days > 1 ? 's' : ''}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Bottom spacing */}
        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </View>
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
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    gap: SPACING.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  statNumber: {
    fontSize: FONT_SIZE.title - 4,
    fontWeight: FONT_WEIGHT.bold,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.slate400,
    marginTop: SPACING.xs,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  requestButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
  },
  section: {
    marginTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
    marginBottom: SPACING.lg,
  },
  emptyState: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.xxxl + SPACING.sm,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate400,
    marginTop: SPACING.md,
  },
  requestCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.sm,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  requestType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  requestTypeText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate800,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  statusText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },
  requestDetails: {
    gap: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  detailText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
  },
});
