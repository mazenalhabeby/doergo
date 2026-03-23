import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/contexts/auth-context';
import { timeOffApi, type TimeOffRequest } from '../../../src/lib/api';
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

function getDayCount(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

function getTypeIcon(reason?: string): keyof typeof Ionicons.glyphMap {
  if (!reason) return 'calendar-outline';
  const lower = reason.toLowerCase();
  if (lower.includes('sick') || lower.includes('medical')) return 'medkit-outline';
  if (lower.includes('personal') || lower.includes('family')) return 'people-outline';
  return 'sunny-outline';
}

function getTypeLabel(reason?: string): string {
  if (!reason) return 'Time Off';
  const lower = reason.toLowerCase();
  if (lower.includes('sick') || lower.includes('medical')) return 'Sick Leave';
  if (lower.includes('personal') || lower.includes('family')) return 'Personal';
  if (lower.includes('vacation') || lower.includes('holiday')) return 'Vacation';
  return 'Time Off';
}

export default function TimeOffScreen() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Request modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRequests = useCallback(async (showRefresh = false) => {
    if (!user?.id) return;
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      const data = await timeOffApi.list(user.id);
      setRequests(data || []);
    } catch (err: any) {
      if (err?.statusCode === 401) return;
      setError(err instanceof Error ? err.message : 'Failed to load time off requests');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleRefresh = () => fetchRequests(true);

  const handleSubmitRequest = async () => {
    if (!user?.id) return;

    // Validate dates
    if (!startDate.trim() || !endDate.trim()) {
      Alert.alert('Required', 'Please enter both start and end dates.');
      return;
    }

    // Basic date format validation (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      Alert.alert('Invalid Date', 'Please enter dates in YYYY-MM-DD format (e.g., 2026-03-25).');
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      Alert.alert('Invalid Range', 'End date must be on or after start date.');
      return;
    }

    try {
      setIsSubmitting(true);
      await timeOffApi.request(user.id, {
        startDate: startDate.trim(),
        endDate: endDate.trim(),
        reason: reason.trim() || undefined,
      });
      setShowRequestModal(false);
      setStartDate('');
      setEndDate('');
      setReason('');
      Alert.alert('Success', 'Time off request submitted.');
      fetchRequests();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = (request: TimeOffRequest) => {
    Alert.alert(
      'Cancel Request',
      'Are you sure you want to cancel this time off request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            try {
              await timeOffApi.cancel(request.id);
              fetchRequests();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to cancel request');
            }
          },
        },
      ],
    );
  };

  // Calculate stats from real data
  const stats = {
    approved: requests.filter(r => r.status === 'APPROVED').length,
    pending: requests.filter(r => r.status === 'PENDING').length,
    usedDays: requests
      .filter(r => r.status === 'APPROVED')
      .reduce((sum, r) => sum + getDayCount(r.startDate, r.endDate), 0),
    totalRequests: requests.length,
  };

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
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchRequests()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Request Time Off Modal */}
      <Modal
        visible={showRequestModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRequestModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Request Time Off</Text>

            <Text style={styles.inputLabel}>Start Date *</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.slate400}
              value={startDate}
              onChangeText={setStartDate}
              maxLength={10}
              autoFocus
            />

            <Text style={styles.inputLabel}>End Date *</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.slate400}
              value={endDate}
              onChangeText={setEndDate}
              maxLength={10}
            />

            <Text style={styles.inputLabel}>Reason (optional)</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="e.g., Vacation, Sick Leave, Personal..."
              placeholderTextColor={COLORS.slate400}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowRequestModal(false);
                  setStartDate('');
                  setEndDate('');
                  setReason('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, isSubmitting && styles.buttonDisabled]}
                onPress={handleSubmitRequest}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.modalSubmitText}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
            <Text style={[styles.statNumber, { color: COLORS.primary }]}>{stats.usedDays}</Text>
            <Text style={styles.statLabel}>Days Used</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.slate400 }]}>{stats.totalRequests}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
        </View>

        {/* Request Button */}
        <TouchableOpacity style={styles.requestButton} onPress={() => setShowRequestModal(true)}>
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
              const days = getDayCount(request.startDate, request.endDate);
              const typeLabel = getTypeLabel(request.reason);
              const typeIcon = getTypeIcon(request.reason);

              return (
                <View key={request.id} style={[styles.requestCard, { borderLeftColor: statusStyle.text }]}>
                  <View style={styles.requestHeader}>
                    <View style={styles.requestType}>
                      <Ionicons name={typeIcon} size={20} color={COLORS.primary} />
                      <Text style={styles.requestTypeText}>{typeLabel}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
                      <Text style={[styles.statusText, { color: statusStyle.text }]}>
                        {statusStyle.label}
                      </Text>
                    </View>
                  </View>

                  {request.reason && (
                    <Text style={styles.reasonText} numberOfLines={2}>{request.reason}</Text>
                  )}

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
                      <Text style={styles.detailText}>{days} day{days > 1 ? 's' : ''}</Text>
                    </View>
                  </View>

                  {request.rejectionReason && (
                    <View style={styles.rejectionRow}>
                      <Ionicons name="information-circle-outline" size={14} color={COLORS.error} />
                      <Text style={styles.rejectionText}>{request.rejectionReason}</Text>
                    </View>
                  )}

                  {request.status === 'PENDING' && (
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => handleCancel(request)}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                      <Text style={styles.cancelButtonText}>Cancel Request</Text>
                    </TouchableOpacity>
                  )}
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
  reasonText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
    marginBottom: SPACING.md,
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
  rejectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.slate100,
  },
  rejectionText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.error,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.slate100,
  },
  cancelButtonText: {
    fontSize: FONT_SIZE.base,
    color: COLORS.error,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl + 2,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.slate800,
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate700,
    marginBottom: SPACING.xs,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    color: COLORS.slate800,
    marginBottom: SPACING.md,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: COLORS.slate200,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    color: COLORS.slate800,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: SPACING.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.slate100,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate500,
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
