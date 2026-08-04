import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  TextInput,
  Modal,
  Animated,
  Pressable,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../src/contexts/theme-context';
import { useToast } from '../../src/contexts/toast-context';
import { attendanceApi, TimeEntry } from '../../src/lib/api';
import { useTimeFormat } from '../../src/hooks/useTimeFormat';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../src/lib/constants';
import { Skeleton, ConfirmSheet, ScreenContainer } from '../../src/components';

const QUICK_MINUTES = [15, 30, 60, 90];

export default function ExtraTimeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();
  const { formatTime } = useTimeFormat();

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Approve modal state
  const [approveTarget, setApproveTarget] = useState<TimeEntry | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState<number>(30);
  const [customMinutes, setCustomMinutes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reject confirm state
  const [rejectTarget, setRejectTarget] = useState<TimeEntry | null>(null);

  const fetchPending = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      const result = await attendanceApi.getPendingExtraTime();
      setEntries(result);
    } catch (err: any) {
      if (err?.statusCode === 401) return;
      toast.error(t('common.error'), err?.message || t('shiftReminder.loadFailed'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [toast, t]);

  useFocusEffect(useCallback(() => { fetchPending(); }, [fetchPending]));

  const workerName = (entry: TimeEntry | null): string => {
    if (!entry?.user) return t('shiftReminder.unknownWorker');
    return `${entry.user.firstName} ${entry.user.lastName}`.trim() || t('shiftReminder.unknownWorker');
  };

  const openApprove = (entry: TimeEntry) => {
    setSelectedMinutes(30);
    setCustomMinutes('');
    setApproveTarget(entry);
  };

  const effectiveMinutes = (): number => {
    const custom = parseInt(customMinutes, 10);
    if (!Number.isNaN(custom) && custom > 0) return custom;
    return selectedMinutes;
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    const minutes = effectiveMinutes();
    if (minutes <= 0) return;
    const entry = approveTarget;
    setIsSubmitting(true);
    try {
      await attendanceApi.approveExtraTime(entry.id, minutes);
      setApproveTarget(null);
      toast.success(t('common.success'), t('shiftReminder.approveSuccess'));
      await fetchPending();
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('shiftReminder.approveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const entry = rejectTarget;
    setRejectTarget(null);
    try {
      await attendanceApi.rejectExtraTime(entry.id);
      toast.info(t('shiftReminder.rejectSuccess'));
      await fetchPending();
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('shiftReminder.rejectFailed'));
    }
  };

  const renderItem = ({ item }: { item: TimeEntry }) => {
    const name = workerName(item);
    const initials = item.user
      ? `${item.user.firstName?.[0] ?? ''}${item.user.lastName?.[0] ?? ''}`.toUpperCase()
      : '?';

    return (
      <View style={[s.card, { backgroundColor: colors.card }]}>
        <View style={s.cardTop}>
          <View style={[s.avatar, { backgroundColor: COLORS.primary + '20' }]}>
            <Text style={[s.avatarText, { color: COLORS.primary }]}>{initials}</Text>
          </View>
          <View style={s.info}>
            <Text style={[s.name, { color: colors.textPrimary }]}>{name}</Text>
            <View style={s.metaRow}>
              <Ionicons name="business-outline" size={14} color={colors.textMuted} />
              <Text style={[s.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.location?.name || t('common.unknownLocation')}
              </Text>
            </View>
            {item.expectedClockOutAt && (
              <View style={s.metaRow}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={[s.meta, { color: colors.textSecondary }]}>
                  {t('shiftReminder.shiftEndedAt', { time: formatTime(item.expectedClockOutAt, item.location?.timezone) })}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.actions}>
          <TouchableOpacity
            style={[s.actionBtn, s.rejectBtn]}
            onPress={() => setRejectTarget(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={18} color="#DC2626" />
            <Text style={s.rejectText}>{t('shiftReminder.reject')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, s.approveBtn]}
            onPress={() => openApprove(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={s.approveText}>{t('shiftReminder.approve')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const isCustomActive = customMinutes.trim().length > 0;

  return (
    <View style={[s.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBack}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('shiftReminder.leaderTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <Skeleton.ListScreen />
      ) : (
        <ScreenContainer width="content">
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => fetchPending(true)}
                colors={[COLORS.primary]}
                tintColor={COLORS.primary}
              />
            }
            ListHeaderComponent={
              entries.length > 0 ? (
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  {t('shiftReminder.leaderSubtitle')}
                </Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.textMuted} />
                <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>{t('shiftReminder.noPending')}</Text>
                <Text style={[s.emptyText, { color: colors.textMuted }]}>{t('shiftReminder.noPendingDesc')}</Text>
              </View>
            }
          />
        </ScreenContainer>
      )}

      {/* Approve minutes sheet */}
      <ApproveSheet
        visible={!!approveTarget}
        onClose={() => { if (!isSubmitting) setApproveTarget(null); }}
        onConfirm={confirmApprove}
        colors={colors}
        insets={insets}
        name={workerName(approveTarget)}
        quick={QUICK_MINUTES}
        selected={selectedMinutes}
        custom={customMinutes}
        isCustomActive={isCustomActive}
        onSelect={(m) => { setSelectedMinutes(m); setCustomMinutes(''); }}
        onCustom={(v) => setCustomMinutes(v.replace(/[^0-9]/g, ''))}
        confirmMinutes={effectiveMinutes()}
        isSubmitting={isSubmitting}
        t={t}
      />

      {/* Reject confirm */}
      <ConfirmSheet
        visible={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={confirmReject}
        title={t('shiftReminder.rejectTitle')}
        message={rejectTarget ? t('shiftReminder.rejectMessage', { name: workerName(rejectTarget) }) : ''}
        confirmLabel={t('shiftReminder.reject')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        icon="close-circle"
      />
    </View>
  );
}

// Self-contained approve bottom sheet with a minutes picker (quick chips + custom).
function ApproveSheet({
  visible,
  onClose,
  onConfirm,
  colors,
  insets,
  name,
  quick,
  selected,
  custom,
  isCustomActive,
  onSelect,
  onCustom,
  confirmMinutes,
  isSubmitting,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  colors: any;
  insets: { bottom: number };
  name: string;
  quick: number[];
  selected: number;
  custom: string;
  isCustomActive: boolean;
  onSelect: (m: number) => void;
  onCustom: (v: string) => void;
  confirmMinutes: number;
  isSubmitting: boolean;
  t: (k: string, o?: any) => string;
}) {
  const { height } = { height: 900 };
  const slideAnim = useRef(new Animated.Value(height)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(height);
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={mp.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlayAnim }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
              <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </BlurView>
          ) : (
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} onPress={onClose} />
          )}
        </Animated.View>

        <Animated.View style={[mp.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={[mp.handle, { backgroundColor: colors.borderLight }]} />
          <View style={[mp.content, { backgroundColor: colors.card }]}>
            <View style={mp.headerRow}>
              <Text style={[mp.title, { color: colors.textPrimary }]}>{t('shiftReminder.approveTitle')}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[mp.subtitle, { color: colors.textSecondary }]}>
              {t('shiftReminder.approveSubtitle', { name })}
            </Text>

            <View style={mp.chipsRow}>
              {quick.map((m) => {
                const active = !isCustomActive && selected === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[
                      mp.chip,
                      { borderColor: active ? COLORS.primary : colors.border, backgroundColor: active ? COLORS.primary + '15' : 'transparent' },
                    ]}
                    onPress={() => onSelect(m)}
                    activeOpacity={0.7}
                  >
                    <Text style={[mp.chipText, { color: active ? COLORS.primary : colors.textSecondary }]}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[mp.inputLabel, { color: colors.textMuted }]}>{t('shiftReminder.customMinutes')}</Text>
            <TextInput
              style={[
                mp.input,
                { backgroundColor: colors.input, borderColor: isCustomActive ? COLORS.primary : colors.inputBorder, color: colors.textPrimary },
              ]}
              placeholder={t('shiftReminder.minutesLabel')}
              placeholderTextColor={colors.textMuted}
              value={custom}
              onChangeText={onCustom}
              keyboardType="number-pad"
              maxLength={3}
            />

            <TouchableOpacity
              style={[mp.confirmBtn, { backgroundColor: '#059669' }, (isSubmitting || confirmMinutes <= 0) && mp.disabled]}
              onPress={onConfirm}
              disabled={isSubmitting || confirmMinutes <= 0}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={mp.confirmText}>{t('shiftReminder.confirmApprove', { minutes: confirmMinutes })}</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ height: insets.bottom }} />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  headerBack: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  subtitle: { fontSize: FONT_SIZE.sm, paddingHorizontal: SPACING.xs, marginBottom: SPACING.md },
  list: { padding: SPACING.lg, paddingBottom: SPACING.xxl, flexGrow: 1 },
  card: { borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, ...SHADOWS.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md },
  avatarText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  info: { flex: 1 },
  name: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: 2 },
  meta: { fontSize: FONT_SIZE.sm, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  rejectBtn: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA' },
  rejectText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: '#DC2626' },
  approveBtn: { backgroundColor: '#059669' },
  approveText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold, color: '#fff' },
  empty: { paddingVertical: SPACING.xxxl * 2, alignItems: 'center', gap: SPACING.sm },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  emptyText: { fontSize: FONT_SIZE.base, textAlign: 'center', maxWidth: 260 },
});

const mp = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: SPACING.sm },
  content: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.xl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, flex: 1 },
  subtitle: { fontSize: FONT_SIZE.base, marginBottom: SPACING.lg },
  chipsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  chip: { flex: 1, paddingVertical: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center' },
  chipText: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  inputLabel: { fontSize: FONT_SIZE.sm, marginBottom: SPACING.xs },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.base,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  confirmText: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: '#fff' },
  disabled: { opacity: 0.6 },
});
