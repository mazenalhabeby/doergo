import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@/components/amazen/ink-icon';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { overtimeApi, teamApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { approverCandidates, type ApproverCandidate } from '@/lib/overtime-approvers';
import { SignatureCapture } from '@/components';
import { Ground, HeaderBack, ScreenHeader } from '@/components/amazen';
import { useScreenWidth } from '@/components/screen-container';
import { goBack } from '@/lib/go-back';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '@/lib/constants';
import { useQueuedCreate } from '@/offline/actions/queued-create';
import { personName } from '@hbcfield/shared/client';
import { initialOf } from '@/lib/people';

const DURATION_OPTIONS = [
  { label: '30 min', value: 30 },
  { label: '1h', value: 60 },
  { label: '1.5h', value: 90 },
  { label: '2h', value: 120 },
  { label: '3h', value: 180 },
  { label: '4h', value: 240 },
];

export default function OvertimeSignatureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const wide = useScreenWidth();
  const { colors } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();

  const { user } = useAuth();
  const [leaders, setLeaders] = useState<ApproverCandidate[]>([]);
  const [selectedLeader, setSelectedLeader] = useState<ApproverCandidate | null>(null);
  const [duration, setDuration] = useState(120);
  const [notes, setNotes] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLeaders, setIsLoadingLeaders] = useState(true);

  // The people this member can reach — see `approverCandidates` for why it is not a role filter.
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([teamApi.managers(), teamApi.list()])
      .then(([managers, team]) => {
        if (cancelled) return;
        setLeaders(
          approverCandidates(
            {
              managers: managers.status === 'fulfilled' ? (managers.value ?? []) : [],
              team: team.status === 'fulfilled' ? (team.value ?? []) : [],
            },
            user?.id,
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLeaders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const approve = useQueuedCreate('overtime.approveSignature', { idField: null });

  const handleSubmit = async () => {
    if (!selectedLeader) {
      return toast.error(t('overtime.selectLeader'));
    }
    if (!signature) {
      return toast.error(t('overtime.signatureRequired'));
    }

    setIsSubmitting(true);
    try {
      const body = {
        approverId: selectedLeader.id,
        leaderName: personName(selectedLeader),
        leaderSignature: signature,
        maxDurationMinutes: duration,
        notes: notes.trim() || undefined,
      };
      // Signed on this phone, so it can be sent from this phone later — the leader has already signed.
      const outcome = await approve.run({ lane: `overtime:${id}`, params: { overtimeId: id! }, body }, () =>
        overtimeApi.approveSignature(id!, body),
      );
      if (outcome.kind === 'refused') {
        toast.error(
          t('common.error'),
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
            outcome.message ||
            t('overtime.failedToApprove'),
        );
        return;
      }
      // A signature on this phone is a request: the person who signed confirms it from their own session.
      toast.success(
        outcome.kind === 'queued'
          ? t('offline.savedForLater')
          : t('overtime.signedAwaitingConfirm', { name: body.leaderName }),
      );
      router.back();
      router.back(); // Go back to attendance
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('overtime.failedToApprove'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Ground style={styles.container}>
      <ScreenHeader
        title={t('overtime.leaderApproval')}
        leading={<HeaderBack onPress={() => goBack()} />}
        style={wide}
      />

      <View style={[{ flex: 1 }, wide]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Instructions */}
          <View style={[styles.infoCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
            <Icon name="info" size={20} color="#2563EB" />
            <Text style={styles.infoText}>{t('overtime.signatureInstructions')}</Text>
          </View>

          {/* Select Team Leader */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('overtime.selectLeaderTitle')}</Text>
            {isLoadingLeaders ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : leaders.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t('overtime.noLeaders')}</Text>
            ) : (
              <View style={styles.leaderList}>
                {leaders.map((leader) => (
                  <TouchableOpacity
                    key={leader.id}
                    style={[
                      styles.leaderItem,
                      {
                        backgroundColor: colors.card,
                        borderColor: selectedLeader?.id === leader.id ? COLORS.primary : colors.border,
                      },
                      selectedLeader?.id === leader.id && styles.leaderItemSelected,
                    ]}
                    onPress={() => setSelectedLeader(leader)}
                  >
                    <View
                      style={[
                        styles.leaderAvatar,
                        { backgroundColor: selectedLeader?.id === leader.id ? COLORS.primary : colors.textMuted },
                      ]}
                    >
                      <Text style={styles.leaderInitial}>{initialOf(leader)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.leaderName, { color: colors.textPrimary }]}>{personName(leader)}</Text>
                      {leader.subtitle ? (
                        <Text style={[styles.leaderRole, { color: colors.textSecondary }]}>{leader.subtitle}</Text>
                      ) : null}
                    </View>
                    {selectedLeader?.id === leader.id && <Icon name="selected" size={24} color={COLORS.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Duration */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('overtime.selectDuration')}</Text>
            <View style={styles.durationGrid}>
              {DURATION_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.durationChip,
                    {
                      backgroundColor: duration === opt.value ? COLORS.primary : colors.card,
                      borderColor: duration === opt.value ? COLORS.primary : colors.border,
                    },
                  ]}
                  onPress={() => setDuration(opt.value)}
                >
                  <Text
                    style={[styles.durationChipText, { color: duration === opt.value ? '#fff' : colors.textPrimary }]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('overtime.notesOptional')}</Text>
            <TextInput
              style={[
                styles.notesInput,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary },
              ]}
              placeholder={t('overtime.notesPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={500}
            />
          </View>

          {/* Signature */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('overtime.leaderSignature')}</Text>
            <SignatureCapture
              title={selectedLeader ? personName(selectedLeader) : t('overtime.leaderSignature')}
              onSave={(base64: string) => setSignature(base64)}
              onClear={() => setSignature(null)}
              existingSignature={signature || undefined}
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, (!selectedLeader || !signature) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting || !selectedLeader || !signature}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon name="selected" size={22} color="#fff" />
                <Text style={styles.submitBtnText}>{t('overtime.approveOvertime')}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Ground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: 40 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: FONT_SIZE.sm, color: '#1E40AF' },
  section: { gap: SPACING.sm },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  leaderList: { gap: SPACING.sm },
  leaderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  leaderItemSelected: { borderWidth: 2 },
  leaderAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  leaderInitial: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  leaderName: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  leaderRole: { fontSize: FONT_SIZE.sm },
  emptyText: { fontSize: FONT_SIZE.base, textAlign: 'center', paddingVertical: SPACING.lg },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  durationChip: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1 },
  durationChipText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  notesInput: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZE.base,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
});
