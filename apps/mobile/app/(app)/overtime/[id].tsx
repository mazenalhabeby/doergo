import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/contexts/theme-context';
import { useToast } from '../../../src/contexts/toast-context';
import { overtimeApi, OvertimeRequest } from '../../../src/lib/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../../../src/lib/constants';
import { ScreenContainer } from '../../../src/components';

export default function OvertimeRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();

  const [request, setRequest] = useState<OvertimeRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState('');

  // Overtime countdown
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);

  const fetchRequest = useCallback(async () => {
    try {
      const data = await overtimeApi.getActive();
      setRequest(data);
    } catch {
      // No active request
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequest();
  }, [fetchRequest]);

  // Countdown timer for approved overtime
  useEffect(() => {
    if (request?.status !== 'APPROVED' || !request.overtimeEndAt) return;

    const update = () => {
      const end = new Date(request.overtimeEndAt!).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.round((end - now) / 60000));
      setRemainingMinutes(remaining);
    };

    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [request?.status, request?.overtimeEndAt]);

  const handleRespond = async (response: 'YES' | 'NO') => {
    setIsSubmitting(true);
    try {
      await overtimeApi.respond({ response, reason: reason.trim() || undefined });
      if (response === 'YES') {
        toast.success(t('overtime.requestSent'));
      } else {
        toast.info(t('overtime.declined'));
        router.back();
      }
      await fetchRequest();
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('overtime.failedToRespond'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGetSignature = () => {
    if (request) {
      router.push(`/overtime/sign/${request.id}` as any);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!request) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.surface }]}>
        <Ionicons name="time-outline" size={48} color={colors.textMuted} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {t('overtime.noActiveRequest')}
        </Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status = request.status;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('overtime.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScreenContainer width="content">
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Location info */}
        <View style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="location" size={24} color={COLORS.primary} />
          <View style={styles.locationInfo}>
            <Text style={[styles.locationName, { color: colors.textPrimary }]}>
              {request.location?.name || t('common.unknownLocation')}
            </Text>
            <Text style={[styles.locationSub, { color: colors.textSecondary }]}>
              {t('overtime.shiftEnded')}
            </Text>
          </View>
        </View>

        {/* PENDING_TECHNICIAN — YES/NO prompt */}
        {status === 'PENDING_TECHNICIAN' && (
          <View style={styles.section}>
            <View style={[styles.promptCard, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
              <Ionicons name="alarm-outline" size={40} color="#D97706" />
              <Text style={styles.promptTitle}>{t('overtime.promptTitle')}</Text>
              <Text style={styles.promptSubtitle}>{t('overtime.promptSubtitle')}</Text>
            </View>

            <TextInput
              style={[styles.reasonInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder={t('overtime.reasonPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnNo]}
                onPress={() => handleRespond('NO')}
                disabled={isSubmitting}
              >
                <Ionicons name="close" size={20} color="#DC2626" />
                <Text style={styles.btnNoText}>{t('overtime.no')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnYes]}
                onPress={() => handleRespond('YES')}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.btnYesText}>{t('overtime.yes')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* PENDING_APPROVAL — waiting for leader */}
        {status === 'PENDING_APPROVAL' && (
          <View style={styles.section}>
            <View style={[styles.statusCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.statusTitle}>{t('overtime.waitingApproval')}</Text>
              <Text style={styles.statusSub}>{t('overtime.waitingApprovalSub')}</Text>
            </View>

            {/* Path B option — get leader signature on this device */}
            <TouchableOpacity
              style={[styles.signatureBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={handleGetSignature}
            >
              <Ionicons name="create-outline" size={24} color={COLORS.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.signatureBtnTitle, { color: colors.textPrimary }]}>
                  {t('overtime.getLeaderSignature')}
                </Text>
                <Text style={[styles.signatureBtnSub, { color: colors.textSecondary }]}>
                  {t('overtime.getLeaderSignatureSub')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* APPROVED — overtime active with countdown */}
        {status === 'APPROVED' && (
          <View style={styles.section}>
            <View style={[styles.statusCard, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
              <Ionicons name="checkmark-circle" size={32} color="#059669" />
              <Text style={[styles.statusTitle, { color: '#065F46' }]}>{t('overtime.approved')}</Text>
              {remainingMinutes !== null && (
                <Text style={[styles.countdownText, { color: '#059669' }]}>
                  {Math.floor(remainingMinutes / 60)}h {remainingMinutes % 60}m {t('overtime.remaining')}
                </Text>
              )}
              {request.maxDurationMinutes && (
                <Text style={[styles.statusSub, { color: '#047857' }]}>
                  {t('overtime.approvedFor', { minutes: request.maxDurationMinutes })}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* REJECTED */}
        {status === 'REJECTED' && (
          <View style={styles.section}>
            <View style={[styles.statusCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Ionicons name="close-circle" size={32} color="#DC2626" />
              <Text style={[styles.statusTitle, { color: '#991B1B' }]}>{t('overtime.rejected')}</Text>
              {request.rejectionReason && (
                <Text style={[styles.statusSub, { color: '#B91C1C' }]}>{request.rejectionReason}</Text>
              )}
            </View>
          </View>
        )}

        {/* EXPIRED */}
        {(status === 'EXPIRED_NO_RESPONSE' || status === 'EXPIRED_NO_APPROVAL') && (
          <View style={styles.section}>
            <View style={[styles.statusCard, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
              <Ionicons name="timer-outline" size={32} color="#64748B" />
              <Text style={[styles.statusTitle, { color: '#334155' }]}>{t('overtime.expired')}</Text>
              <Text style={[styles.statusSub, { color: '#64748B' }]}>{t('overtime.expiredSub')}</Text>
            </View>
          </View>
        )}
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md },
  emptyText: { fontSize: FONT_SIZE.lg, marginTop: SPACING.md },
  backBtn: { marginTop: SPACING.lg, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, backgroundColor: COLORS.primary, borderRadius: RADIUS.md },
  backBtnText: { color: '#fff', fontWeight: FONT_WEIGHT.semibold },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, borderBottomWidth: 1 },
  headerBack: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  content: { padding: SPACING.lg, gap: SPACING.lg },
  locationCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1 },
  locationInfo: { flex: 1 },
  locationName: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  locationSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  section: { gap: SPACING.md },
  promptCard: { alignItems: 'center', padding: SPACING.xl, borderRadius: RADIUS.lg, borderWidth: 1, gap: SPACING.sm },
  promptTitle: { fontSize: 20, fontWeight: FONT_WEIGHT.bold, color: '#92400E', textAlign: 'center' },
  promptSubtitle: { fontSize: FONT_SIZE.base, color: '#A16207', textAlign: 'center' },
  reasonInput: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md, fontSize: FONT_SIZE.base, minHeight: 80, textAlignVertical: 'top' },
  buttonRow: { flexDirection: 'row', gap: SPACING.md },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.lg, borderRadius: RADIUS.md },
  btnNo: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA' },
  btnNoText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, color: '#DC2626' },
  btnYes: { backgroundColor: '#059669' },
  btnYesText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold, color: '#fff' },
  statusCard: { alignItems: 'center', padding: SPACING.xl, borderRadius: RADIUS.lg, borderWidth: 1, gap: SPACING.sm },
  statusTitle: { fontSize: 18, fontWeight: FONT_WEIGHT.bold, textAlign: 'center' },
  statusSub: { fontSize: FONT_SIZE.base, textAlign: 'center' },
  countdownText: { fontSize: 28, fontWeight: FONT_WEIGHT.bold },
  signatureBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1 },
  signatureBtnTitle: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  signatureBtnSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
});
