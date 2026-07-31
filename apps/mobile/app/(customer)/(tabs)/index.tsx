import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../../src/lib/constants';
import { portalApi } from '../../../src/lib/api/portal';
import { portalColor, portalTint, portalIcon } from '../../../src/lib/portal-ui';
import { RequestRow } from '../../../src/components/customer/request-bits';

const CLOSED = /COMPLET|CLOSED|CANCEL|RESOLV|DONE/i;

export default function CustomerHome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const configQ = useQuery({ queryKey: ['portal', 'config'], queryFn: portalApi.config });
  const unitsQ = useQuery({ queryKey: ['portal', 'units'], queryFn: portalApi.units });
  const requestsQ = useQuery({ queryKey: ['portal', 'requests'], queryFn: portalApi.requests });

  const cfg = configQ.data;
  const unit = unitsQ.data?.[0];
  const requests = requestsQ.data ?? [];
  const recent = requests.slice(0, 3);
  const openCount = requests.filter((r) => !CLOSED.test(r.status)).length;
  const categories = (cfg?.categories ?? []).filter((c) => c.isActive !== false).slice(0, 8);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('portal.morning', 'Good morning') : hour < 18 ? t('portal.afternoon', 'Good afternoon') : t('portal.evening', 'Good evening');

  const refreshing = configQ.isFetching || unitsQ.isFetching || requestsQ.isFetching;
  const onRefresh = () => { configQ.refetch(); unitsQ.refetch(); requestsQ.refetch(); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + SPACING.sm, paddingBottom: SPACING.xxxl * 1.5 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greet, { color: colors.textMuted }]}>{greeting},</Text>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{user?.firstName || t('portal.client', 'Client')}</Text>
          </View>
          <Pressable style={[styles.avatar, { backgroundColor: COLORS.primary }]} onPress={() => router.push('/(customer)/(tabs)/profile')}>
            <Text style={styles.avatarText}>{user?.firstName?.[0]?.toUpperCase() || '?'}</Text>
          </Pressable>
        </View>

        {unit ? (
          <View style={[styles.unitChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="location" size={13} color={COLORS.primary} />
            <Text style={[styles.unitText, { color: colors.textSecondary }]} numberOfLines={1}>
              {cfg?.name ? `${cfg.name} · ` : ''}{unit.name}
            </Text>
          </View>
        ) : null}

        {/* Hero CTA */}
        <Pressable style={styles.heroWrap} onPress={() => router.push('/(customer)/report')}>
          <LinearGradient
            colors={['#10B981', '#059669', '#047857']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroBlob1} />
            <View style={styles.heroBlob2} />
            <View style={styles.heroBadge}>
              <MaterialCommunityIcons name="plus" size={26} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>{t('portal.reportIssue', 'Report an issue')}</Text>
            <Text style={styles.heroSub}>{t('portal.heroSub', 'Tell us what’s wrong — we’ll take it from here.')}</Text>
            <View style={styles.heroCta}>
              <Text style={styles.heroCtaText}>{t('portal.startNow', 'Start now')}</Text>
              <Ionicons name="arrow-forward" size={16} color={COLORS.primaryDark} />
            </View>
          </LinearGradient>
        </Pressable>

        {/* Active requests banner */}
        {openCount > 0 ? (
          <Pressable
            style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/(customer)/(tabs)/requests')}
          >
            <View style={[styles.bannerDot, { backgroundColor: COLORS.primary }]} />
            <Text style={[styles.bannerText, { color: colors.textPrimary }]}>
              {t('portal.openCount', '{{count}} in progress', { count: openCount })}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {/* Quick report categories */}
        {categories.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('portal.quickReport', 'Quick report')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.md }}
            >
              {categories.map((c) => (
                <Pressable
                  key={c.key}
                  style={styles.catChip}
                  onPress={() => router.push(`/(customer)/report?category=${encodeURIComponent(c.key)}`)}
                >
                  <View style={[styles.catIcon, { backgroundColor: portalTint(c.color) }]}>
                    <MaterialCommunityIcons name={portalIcon(c.icon)} size={26} color={portalColor(c.color)} />
                  </View>
                  <Text style={[styles.catLabel, { color: colors.textSecondary }]} numberOfLines={2}>{c.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* Recent */}
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginHorizontal: 0, marginTop: 0 }]}>{t('portal.recent', 'Recent')}</Text>
          {requests.length > 3 ? (
            <Pressable onPress={() => router.push('/(customer)/(tabs)/requests')} hitSlop={8}>
              <Text style={[styles.seeAll, { color: COLORS.primary }]}>{t('portal.seeAll', 'See all')}</Text>
            </Pressable>
          ) : null}
        </View>

        {requestsQ.isLoading ? (
          <ActivityIndicator style={{ marginTop: SPACING.lg }} color={COLORS.primary} />
        ) : recent.length > 0 ? (
          recent.map((r) => (
            <RequestRow
              key={r.id}
              title={r.title}
              reference={r.reference}
              status={r.status}
              icon={r.icon}
              color={r.color}
              onPress={() => router.push(`/(customer)/request/${r.id}`)}
            />
          ))
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : COLORS.primaryLight }]}>
              <Ionicons name="checkmark-done" size={26} color={COLORS.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('portal.allClear', 'You’re all caught up')}</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>{t('portal.allClearSub', 'No open requests. Tap above if something needs fixing.')}</Text>
          </View>
        )}

        {/* Contact office */}
        {cfg?.features?.messages !== false ? (
          <Pressable
            style={[styles.contact, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push('/(customer)/(tabs)/messages')}
          >
            <View style={[styles.contactIcon, { backgroundColor: portalTint('cyan') }]}>
              <Ionicons name="chatbubble-ellipses" size={20} color={portalColor('cyan')} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.contactTitle, { color: colors.textPrimary }]}>{t('portal.contact', 'Contact')} {cfg?.contactLabel || ''}</Text>
              <Text style={[styles.contactSub, { color: colors.textMuted }]}>{t('portal.contactSub', 'Chat with the team')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.12,
  shadowRadius: 16,
  elevation: 6,
};

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  greet: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base },
  name: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.title, marginTop: 1 },
  avatar: { width: 46, height: 46, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.xl, color: '#fff' },
  unitChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginHorizontal: SPACING.lg, marginBottom: SPACING.md, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  unitText: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs, maxWidth: 260 },

  // Hero
  heroWrap: { marginHorizontal: SPACING.lg, marginBottom: SPACING.lg, borderRadius: 26, ...shadow, shadowColor: '#047857', shadowOpacity: 0.35 },
  hero: { borderRadius: 26, padding: SPACING.lg, overflow: 'hidden' },
  heroBlob1: { position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.13)' },
  heroBlob2: { position: 'absolute', bottom: -50, right: 40, width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroBadge: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md },
  heroTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: 24, color: '#fff' },
  heroSub: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, color: 'rgba(255,255,255,0.9)', marginTop: 4, marginBottom: SPACING.md, maxWidth: '86%' },
  heroCta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full },
  heroCtaText: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.base, color: COLORS.primaryDark },

  // Active banner
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: SPACING.lg, marginBottom: SPACING.lg, paddingHorizontal: SPACING.md, paddingVertical: 13, borderRadius: RADIUS.lg, borderWidth: 1 },
  bannerDot: { width: 8, height: 8, borderRadius: 4 },
  bannerText: { flex: 1, fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, fontWeight: '600' },

  // Sections
  sectionTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.lg, marginHorizontal: SPACING.lg, marginTop: SPACING.sm, marginBottom: SPACING.md },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SPACING.lg, marginTop: SPACING.lg, marginBottom: SPACING.md },
  seeAll: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, fontWeight: '600' },

  // Category chips
  catChip: { width: 76, alignItems: 'center', gap: 8 },
  catIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs, textAlign: 'center', lineHeight: 14 },

  // Empty
  emptyCard: { alignItems: 'center', marginHorizontal: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, paddingVertical: SPACING.xl, paddingHorizontal: SPACING.lg },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  emptyTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.base },
  emptySub: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, textAlign: 'center', marginTop: 3, lineHeight: 18 },

  // Contact
  contact: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: SPACING.lg, marginTop: SPACING.lg, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1 },
  contactIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contactTitle: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, fontWeight: '600' },
  contactSub: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginTop: 1 },
});
