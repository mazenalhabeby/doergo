import { useState, useEffect, useCallback } from 'react';
import { useNow } from '../../../src/hooks/use-now';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/contexts/theme-context';
import { useToast } from '../../../src/island/island-context';
import { overtimeApi, OvertimeRequest } from '../../../src/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../../../src/lib/constants';
import { ScreenContainer, ScreenHeader } from '../../../src/components';
import { useQueuedCreate } from '../../../src/offline/actions/queued-create';
import { formatDuration } from '@hbcfield/shared/client';
import { overtimePlaceLine, waitingText } from '../../../src/components/time/time-logic';
import { useTimeFormat } from '../../../src/hooks/useTimeFormat';
import { styles } from '../../../src/screens/app/overtime/overtime-request-styles';
import { EmptyState } from '../../../src/components/amazen/empty-state';

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

  // Countdown for approved overtime — derived from the clock, which pauses in the background.
  const counting = request?.status === 'APPROVED' && !!request.overtimeEndAt;
  const nowMs = useNow(30_000, counting);
  const { formatClock } = useTimeFormat();
  const placeLine = request ? overtimePlaceLine(request, new Date()) : null;
  const remainingMinutes = counting
    ? Math.max(0, Math.round((new Date(request!.overtimeEndAt!).getTime() - nowMs) / 60000))
    : null;

  const respond = useQueuedCreate('overtime.respond', { idField: null });

  const handleRespond = async (response: 'YES' | 'NO') => {
    setIsSubmitting(true);
    try {
      const body = { response, reason: reason.trim() || undefined };
      // The answer is kept and sent even with no signal — "yes, I am staying" must not be lost to a basement.
      const outcome = await respond.run({ lane: `overtime:${id}`, body }, () => overtimeApi.respond(body));
      if (outcome.kind === 'refused') {
        toast.error(
          t('common.error'),
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
            outcome.message ||
            t('overtime.failedToRespond'),
        );
        return;
      }
      if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
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
      router.push(`/overtime/sign/${request.id}` as Href);
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
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <EmptyState
          fill
          icon="time-outline"
          text={t('overtime.noActiveRequest')}
          action={{ label: t('common.back'), onPress: () => router.back() }}
        />
      </View>
    );
  }

  const status = request.status;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      {/* Header */}
      <ScreenHeader title={t('overtime.title')} />

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
                {placeLine
                  ? t(`overtime.place.${placeLine.key}`, {
                      time: formatClock(placeLine.at, request.location?.timezone ?? undefined),
                    })
                  : null}
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
                style={[
                  styles.reasonInput,
                  { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary },
                ]}
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
                <Text style={styles.statusTitle}>{waitingText(request, t)}</Text>
                <Text style={styles.statusSub}>
                  {request.askedOf?.names?.length ? t('overtime.waitingToldSub') : t('overtime.waitingApprovalSub')}
                </Text>
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
                    {formatDuration(remainingMinutes)} {t('overtime.remaining')}
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
