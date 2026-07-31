import { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSocketContext } from '../../../src/contexts/socket-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../../src/lib/constants';
import { portalApi } from '../../../src/lib/api/portal';
import { portalColor, portalTint, portalIcon } from '../../../src/lib/portal-ui';
import { StatusPill } from '../../../src/components/customer/request-bits';

export default function RequestDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { subscribe, isConnected } = useSocketContext();

  const q = useQuery({ queryKey: ['portal', 'request', id], queryFn: () => portalApi.request(String(id)), enabled: !!id });
  const req = q.data;

  // Live: refetch when this request's status changes server-side (socket is
  // confined to user:{id}; the server emits task.statusChanged to the creator).
  useEffect(() => {
    if (!id) return;
    const off = subscribe<{ task?: { id?: string } }>('task.statusChanged', (payload) => {
      if (payload?.task?.id === String(id)) {
        qc.invalidateQueries({ queryKey: ['portal', 'request', id] });
        qc.invalidateQueries({ queryKey: ['portal', 'requests'] });
      }
    });
    return off;
  }, [subscribe, id, qc, isConnected]);

  const submitted =
    req?.createdAt
      ? (() => {
          try {
            return new Date(req.createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
          } catch {
            return null;
          }
        })()
      : null;

  const photos = (req?.attachments ?? []).filter((a) => /image/i.test(a.fileType) || /\.(jpg|jpeg|png|webp|heic)$/i.test(a.fileName || ''));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + SPACING.sm }}>
      <View style={styles.top}>
        <Pressable style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{t('portal.requestDetails', 'Request details')}</Text>
          {req ? <Text style={[styles.topSub, { color: colors.textMuted }]}>{req.reference}</Text> : null}
        </View>
      </View>

      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: SPACING.xxxl }} color={COLORS.primary} />
      ) : !req ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>{t('portal.notFound', 'Request not found.')}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xxxl }} showsVerticalScrollIndicator={false}>
          {/* Header card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardTop}>
              <View style={[styles.thumb, { backgroundColor: portalTint(req.color) }]}>
                <MaterialCommunityIcons name={portalIcon(req.icon)} size={26} color={portalColor(req.color)} />
              </View>
              <StatusPill status={req.status} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{req.title}</Text>
            <View style={styles.metaRow}>
              {req.unitName ? (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>{req.unitName}</Text>
                </View>
              ) : null}
              {submitted ? (
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>{t('portal.submittedOn', 'Submitted {{date}}', { date: submitted })}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Photos */}
          {photos.length > 0 ? (
            <>
              <Text style={[styles.section, { color: colors.textPrimary }]}>{t('portal.photos', 'Photos')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm }}>
                {photos.map((a) => (
                  <Pressable key={a.id} onPress={() => Linking.openURL(a.fileUrl).catch(() => {})}>
                    <Image source={{ uri: a.fileUrl }} style={[styles.photo, { borderColor: colors.border }]} resizeMode="cover" />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* Details */}
          {req.description ? (
            <>
              <Text style={[styles.section, { color: colors.textPrimary }]}>{t('portal.details', 'Details')}</Text>
              <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.desc, { color: colors.textSecondary }]}>{req.description}</Text>
              </View>
            </>
          ) : null}

          {/* Timeline */}
          <Text style={[styles.section, { color: colors.textPrimary }]}>{t('portal.status', 'Status')}</Text>
          <View style={{ paddingHorizontal: SPACING.lg }}>
            {(req.timeline || []).map((s, i) => {
              const isLast = i === (req.timeline?.length || 0) - 1;
              return (
                <View key={i} style={styles.step}>
                  <View style={styles.stepCol}>
                    <View
                      style={[
                        styles.dot,
                        s.state === 'done' && { backgroundColor: COLORS.success, borderColor: COLORS.success },
                        s.state === 'active' && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
                        s.state === 'pending' && { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                    >
                      {s.state === 'done' ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                      {s.state === 'active' ? <View style={styles.pulse} /> : null}
                    </View>
                    {!isLast ? (
                      <View style={[styles.line, { backgroundColor: s.state === 'done' ? COLORS.success : colors.border }]} />
                    ) : null}
                  </View>
                  <View style={[styles.stepBody, s.state === 'active' && { backgroundColor: isDark ? 'rgba(16,185,129,0.10)' : COLORS.primaryLight, borderColor: 'transparent' }]}>
                    <Text style={[styles.stepLabel, { color: colors.textPrimary }]}>{s.label}</Text>
                    <Text style={[styles.stepState, { color: s.state === 'active' ? COLORS.primary : colors.textMuted }]}>
                      {s.state === 'done'
                        ? t('portal.done', 'Done')
                        : s.state === 'active'
                        ? t('portal.inProgress', 'In progress')
                        : t('portal.pending', 'Pending')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  back: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.lg },
  topSub: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs, marginTop: 1 },

  card: { marginHorizontal: SPACING.lg, borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACING.lg },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  thumb: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.xxl },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm },

  section: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.lg, marginHorizontal: SPACING.lg, marginTop: SPACING.lg, marginBottom: SPACING.md },
  photo: { width: 96, height: 96, borderRadius: RADIUS.lg, borderWidth: 1 },

  descCard: { marginHorizontal: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.md },
  desc: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, lineHeight: 21 },

  step: { flexDirection: 'row', gap: 14 },
  stepCol: { alignItems: 'center', width: 30 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pulse: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#fff' },
  line: { width: 2, flex: 1, marginTop: 2 },
  stepBody: { flex: 1, marginBottom: SPACING.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'transparent' },
  stepLabel: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, fontWeight: '600' },
  stepState: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginTop: 2 },
  empty: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, textAlign: 'center', marginTop: SPACING.xxxl },
});
