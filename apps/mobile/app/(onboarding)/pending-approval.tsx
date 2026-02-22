import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/auth-context';
import { onboardingApi } from '../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, ROUTES } from '../../src/lib/constants';

const POLL_INTERVAL = 30000; // 30 seconds

export default function PendingApprovalScreen() {
  const router = useRouter();
  const { refreshUser, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const [orgName, setOrgName] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requestId, setRequestId] = useState('');
  const [isCanceling, setIsCanceling] = useState(false);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    loadStatus();
    pollRef.current = setInterval(loadStatus, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const loadStatus = async () => {
    try {
      const result = await onboardingApi.getStatus();
      if (!result.needsOnboarding) {
        // Approved! Refresh user and navigate
        await refreshUser();
        return;
      }
      if (result.pendingRequest) {
        setOrgName(result.pendingRequest.organizationName);
        setRequestMessage(result.pendingRequest.message || '');
        setRequestId(result.pendingRequest.id);
        if (result.pendingRequest.status === 'APPROVED') {
          setStatus('approved');
          await refreshUser();
        } else if (result.pendingRequest.status === 'REJECTED') {
          setStatus('rejected');
          setRejectionReason(result.pendingRequest.rejectionReason || '');
        }
      } else if (!result.hasPendingJoinRequest) {
        // No pending request - go back to choose path
        router.replace(ROUTES.choosePath as Href);
      }
    } catch (error) {
      console.error('Error polling status:', error);
    }
  };

  const handleCancel = async () => {
    if (!requestId) return;
    Alert.alert('Cancel Request', 'Are you sure you want to cancel your join request?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setIsCanceling(true);
          try {
            await onboardingApi.cancelJoinRequest(requestId);
            router.replace(ROUTES.choosePath as Href);
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to cancel request');
          } finally {
            setIsCanceling(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.xl }]}>
      <StatusBar style="dark" />

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <View style={styles.iconBg}>
            <Ionicons name="hourglass-outline" size={48} color={COLORS.primary} />
          </View>
        </View>

        <Text style={styles.title}>
          {status === 'rejected' ? 'Request Rejected' : 'Waiting for Approval'}
        </Text>

        <Text style={styles.subtitle}>
          {status === 'rejected'
            ? 'Your request to join was rejected'
            : 'Your request to join has been submitted'
          }
        </Text>

        {orgName ? (
          <View style={styles.infoBadge}>
            <Ionicons name="business-outline" size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>{orgName}</Text>
          </View>
        ) : null}

        {requestMessage ? (
          <View style={styles.messageBadge}>
            <Text style={styles.messageLabel}>Your message:</Text>
            <Text style={styles.messageText}>{requestMessage}</Text>
          </View>
        ) : null}

        {status === 'rejected' && rejectionReason ? (
          <View style={styles.rejectionBadge}>
            <Ionicons name="close-circle" size={18} color={COLORS.error} />
            <Text style={styles.rejectionText}>{rejectionReason}</Text>
          </View>
        ) : null}

        {status === 'pending' && (
          <View style={styles.pollIndicator}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.pollText}>Checking every 30 seconds...</Text>
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
        {status === 'rejected' && (
          <TouchableOpacity style={styles.retryButton} onPress={() => router.replace(ROUTES.choosePath as Href)}>
            <Text style={styles.retryButtonText}>Try a Different Path</Text>
          </TouchableOpacity>
        )}

        {status === 'pending' && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel} disabled={isCanceling}>
            {isCanceling ? <ActivityIndicator color={COLORS.error} size="small" /> : <Text style={styles.cancelButtonText}>Cancel Request</Text>}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logoutRow} onPress={logout}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.slate500} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.slate50 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl },
  iconContainer: { marginBottom: SPACING.xl },
  iconBg: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 24, fontWeight: FONT_WEIGHT.bold, color: COLORS.slate800, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { fontSize: FONT_SIZE.lg, color: COLORS.slate500, textAlign: 'center', marginBottom: SPACING.xl },
  infoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.full, marginBottom: SPACING.md,
  },
  infoText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.primary },
  messageBadge: {
    width: '100%', padding: SPACING.md, backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.slate200, marginBottom: SPACING.md,
  },
  messageLabel: { fontSize: FONT_SIZE.xs, color: COLORS.slate400, marginBottom: SPACING.xs },
  messageText: { fontSize: FONT_SIZE.md, color: COLORS.slate600, fontStyle: 'italic' },
  rejectionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, width: '100%', padding: SPACING.md,
    backgroundColor: COLORS.errorLight, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.errorBorder,
  },
  rejectionText: { flex: 1, fontSize: FONT_SIZE.md, color: COLORS.error },
  pollIndicator: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.lg },
  pollText: { fontSize: FONT_SIZE.sm, color: COLORS.slate400 },
  footer: { padding: SPACING.xl, gap: SPACING.md, alignItems: 'center' },
  cancelButton: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl },
  cancelButtonText: { fontSize: FONT_SIZE.md, color: COLORS.error, fontWeight: FONT_WEIGHT.semibold },
  retryButton: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl,
    width: '100%', alignItems: 'center',
  },
  retryButtonText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  logoutRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  logoutText: { fontSize: FONT_SIZE.md, color: COLORS.slate500 },
});
