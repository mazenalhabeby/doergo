import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image, useWindowDimensions } from 'react-native';
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
import { resolveMediaUrl } from '../../../src/lib/api';
import { portalColor, portalTint, portalIcon } from '../../../src/lib/portal-ui';
import { RequestRow } from '../../../src/components/customer/request-bits';

const CLOSED = /COMPLET|CLOSED|CANCEL|RESOLV|DONE/i;

// Per-accent tile palette (dark + light) — a colored icon on a softly tinted
// card, matching the premium grid look. fg = icon colour.
type AccentKey = 'blue' | 'green' | 'purple' | 'teal' | 'amber';
const ACCENTS: Record<AccentKey, { dark: [string, string]; light: [string, string]; fg: string }> = {
  blue:   { dark: ['#18293f', '#0f1a2a'], light: ['#eaf1fe', '#dce8fd'], fg: '#3b82f6' },
  green:  { dark: ['#123227', '#0c2019'], light: ['#e7f7ef', '#d6f0e2'], fg: '#10b981' },
  purple: { dark: ['#241d3a', '#171226'], light: ['#f1ecfb', '#e6def8'], fg: '#8b5cf6' },
  teal:   { dark: ['#123236', '#0c2124'], light: ['#e6f5f4', '#d4efeb'], fg: '#14b8a6' },
  amber:  { dark: ['#332810', '#201908'], light: ['#fdf3e0', '#fae8cb'], fg: '#f59e0b' },
};

export default function CustomerHome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

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

  // Optional per-portal cover photo; falls back to a premium gradient.
  const heroImage = resolveMediaUrl((cfg as any)?.coverImageUrl || (cfg as any)?.heroImageUrl);
  const officeLabel = cfg?.contactLabel || t('portal.office', 'the office');

  // Premium action grid — wired to what this portal actually does. Messages is
  // gated on the portal feature flag so we never show a dead tile.
  const tiles: { key: string; label: string; icon: string; accent: AccentKey; badge?: number; onPress: () => void }[] = [
    { key: 'report', label: t('portal.tileReport', 'Report a Maintenance Issue'), icon: 'wrench', accent: 'blue', onPress: () => router.push('/(customer)/report') },
    { key: 'requests', label: t('portal.tileRequests', 'My Requests'), icon: 'clipboard-text-outline', accent: 'green', badge: openCount || undefined, onPress: () => router.push('/(customer)/(tabs)/requests') },
    ...(cfg?.features?.messages !== false
      ? [{ key: 'messages', label: t('portal.tileContact', 'Contact {{office}}', { office: officeLabel }), icon: 'message-text-outline', accent: 'purple' as AccentKey, onPress: () => router.push('/(customer)/(tabs)/messages') }]
      : []),
    { key: 'profile', label: t('portal.tileProfile', 'My Account'), icon: 'account-circle-outline', accent: 'teal', onPress: () => router.push('/(customer)/(tabs)/profile') },
  ];
  const tileW = (width - SPACING.lg * 2 - SPACING.md) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: SPACING.xxxl * 1.5 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} progressViewOffset={insets.top + 40} />}
      >
        {/* ── Hero header (photo or premium gradient) ── */}
        <View style={styles.hero}>
          {heroImage ? (
            <Image source={{ uri: heroImage }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
          ) : null}
          {/* Dark wash so text stays legible over any image, + brand tint */}
          <LinearGradient
            colors={heroImage
              ? ['rgba(6,10,16,0.55)', 'rgba(6,10,16,0.35)', colors.background]
              : (isDark ? ['#0f2a22', '#0c1a20', colors.background] : ['#0e3d31', '#0c2f2a', colors.background])}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {!heroImage ? <><View style={styles.blob1} /><View style={styles.blob2} /></> : null}

          <View style={[styles.heroContent, { paddingTop: insets.top + SPACING.md }]}>
            <View style={styles.heroTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.greet}>{greeting},</Text>
                <Text style={styles.name} numberOfLines={1}>{user?.firstName || t('portal.client', 'Client')}</Text>
              </View>
              <Pressable style={styles.avatar} onPress={() => router.push('/(customer)/(tabs)/profile')} hitSlop={8}>
                <Text style={styles.avatarText}>{user?.firstName?.[0]?.toUpperCase() || '?'}</Text>
              </Pressable>
            </View>
            {cfg?.name ? <Text style={styles.propName} numberOfLines={1}>{cfg.name}</Text> : null}
            {unit?.name ? <Text style={styles.propUnit} numberOfLines={1}>{unit.name}</Text> : null}
          </View>
        </View>

        {/* ── Action grid ── */}
        <View style={styles.grid}>
          {tiles.map((tile) => {
            const a = ACCENTS[tile.accent];
            return (
              <Pressable key={tile.key} style={[styles.tile, { width: tileW }]} onPress={tile.onPress}>
                <LinearGradient colors={isDark ? a.dark : a.light} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tileBg}>
                  <View style={[styles.tileIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#ffffffcc' }]}>
                    <MaterialCommunityIcons name={tile.icon as any} size={26} color={a.fg} />
                    {tile.badge ? (
                      <View style={[styles.tileBadge, { backgroundColor: a.fg }]}>
                        <Text style={styles.tileBadgeText}>{tile.badge > 9 ? '9+' : tile.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.tileLabel, { color: isDark ? '#f1f5f9' : colors.textPrimary }]} numberOfLines={2}>{tile.label}</Text>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>

        {/* ── Quick report categories ── */}
        {categories.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('portal.quickReport', 'Quick report')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.md }}>
              {categories.map((c) => (
                <Pressable key={c.key} style={styles.catChip} onPress={() => router.push(`/(customer)/report?category=${encodeURIComponent(c.key)}`)}>
                  <View style={[styles.catIcon, { backgroundColor: portalTint(c.color) }]}>
                    <MaterialCommunityIcons name={portalIcon(c.icon)} size={26} color={portalColor(c.color)} />
                  </View>
                  <Text style={[styles.catLabel, { color: colors.textSecondary }]} numberOfLines={2}>{c.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* ── Recent ── */}
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
            <RequestRow key={r.id} title={r.title} reference={r.reference} status={r.status} icon={r.icon} color={r.color} onPress={() => router.push(`/(customer)/request/${r.id}`)} />
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Hero
  hero: { minHeight: 210, paddingBottom: SPACING.xl, overflow: 'hidden' },
  blob1: { position: 'absolute', top: -50, right: -40, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(16,185,129,0.16)' },
  blob2: { position: 'absolute', top: 40, right: 90, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(45,212,191,0.10)' },
  heroContent: { paddingHorizontal: SPACING.lg },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  greet: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, color: 'rgba(255,255,255,0.85)' },
  name: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.title, color: '#fff', marginTop: 1 },
  avatar: { width: 46, height: 46, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
  avatarText: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.xl, color: '#fff' },
  propName: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.lg, color: '#fff', marginTop: SPACING.md, fontWeight: '600' },
  propUnit: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, paddingHorizontal: SPACING.lg, marginTop: -SPACING.sm },
  tile: { borderRadius: 22, overflow: 'hidden' },
  tileBg: { minHeight: 132, borderRadius: 22, padding: SPACING.md, justifyContent: 'space-between' },
  tileIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileBadge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  tileBadgeText: { color: '#fff', fontFamily: 'Outfit_800ExtraBold', fontSize: 11 },
  tileLabel: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.base, lineHeight: 20, marginTop: SPACING.sm },

  // Sections
  sectionTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.lg, marginHorizontal: SPACING.lg, marginTop: SPACING.xl, marginBottom: SPACING.md },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SPACING.lg, marginTop: SPACING.xl, marginBottom: SPACING.md },
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
});
