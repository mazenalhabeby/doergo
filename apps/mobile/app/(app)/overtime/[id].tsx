import { useState, useEffect, useCallback } from 'react';
import { useNow } from '@/hooks/use-now';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Icon } from '@/components/amazen/ink-icon';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { overtimeApi, OvertimeRequest } from '@/lib/api';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '@/lib/constants';
import { Ground, HeaderBack, ScreenHeader } from '@/components/amazen';
import { useScreenWidth } from '@/components/screen-container';
import { goBack } from '@/lib/go-back';
import { formatDuration } from '@hbcfield/shared/client';
import { overtimePlaceLine, waitingText } from '@/features/time/time-logic';
import { useTimeFormat } from '@/hooks/use-time-format';
import { styles } from '@/features/time/overtime/overtime-request-styles';
import { EmptyState } from '@/components/amazen/empty-state';

export default function OvertimeRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const wide = useScreenWidth();
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [request, setRequest] = useState<OvertimeRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          icon="time"
          text={t('overtime.noActiveRequest')}
          action={{ label: t('common.back'), onPress: () => router.back() }}
        />
      </View>
    );
  }

  const status = request.status;

  return (
    <Ground style={styles.container}>
      <ScreenHeader title={t('overtime.title')} leading={<HeaderBack onPress={() => goBack()} />} style={wide} />

      <View style={[{ flex: 1 }, wide]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Location info */}
          <View style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Icon name="pin" size={24} color={COLORS.primary} />
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

          {/* The old YES/NO prompt (PENDING_TECHNICIAN) is gone: nothing creates it (clock review C10). */}
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
                <Icon name="edit" size={24} color={COLORS.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.signatureBtnTitle, { color: colors.textPrimary }]}>
                    {t('overtime.getLeaderSignature')}
                  </Text>
                  <Text style={[styles.signatureBtnSub, { color: colors.textSecondary }]}>
                    {t('overtime.getLeaderSignatureSub')}
                  </Text>
                </View>
                <Icon name="chevronRight" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* APPROVED — overtime active with countdown */}
          {status === 'APPROVED' && (
            <View style={styles.section}>
              <View style={[styles.statusCard, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Icon name="selected" size={32} color="#059669" />
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
                <Icon name="closeCircle" size={32} color="#DC2626" />
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
                <Icon name="timer" size={32} color="#64748B" />
                <Text style={[styles.statusTitle, { color: '#334155' }]}>{t('overtime.expired')}</Text>
                <Text style={[styles.statusSub, { color: '#64748B' }]}>{t('overtime.expiredSub')}</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Ground>
  );
}
