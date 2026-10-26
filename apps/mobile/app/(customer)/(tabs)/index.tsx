import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePortalRequests } from '@/hooks/use-portal-requests';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/amazen/ink-icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '@/lib/constants';
import { portalApi } from '@/lib/api/portal';
import { resolveMediaUrl } from '@/lib/api';
import { initialOf } from '@/lib/people';
import { RequestRow } from '@/features/customer/request-bits';
import { CountBadge } from '@/components/amazen/count-badge';
import {
  ReportGlyph,
  RequestsGlyph,
  ContactGlyph,
  AccountGlyph,
  CategoryGlyph,
} from '@/features/customer/portal-glyphs';
import { useCustomerHome, type AccentKey } from '@/features/customer/screens/tabs/use-customer-home';
import { ACCENTS, styles } from '@/features/customer/screens/tabs/customer-home-helpers';

export default function CustomerHome() {
  const {
    insets,
    router,
    user,
    colors,
    isDark,
    t,
    width,
    requestsQ,
    isOnPhone,
    cfg,
    unit,
    requests,
    recent,
    categories,
    greeting,
    refreshing,
    onRefresh,
    heroImage,
    tiles,
    tileW,
  } = useCustomerHome();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: SPACING.xxxl * 1.5 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            progressViewOffset={insets.top + 40}
          />
        }
      >
        {/* ── Hero header (photo or premium gradient) ── */}
        <View style={styles.hero}>
          {heroImage ? <Image source={{ uri: heroImage }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          {/* Dark wash so text stays legible over any image, + brand tint */}
          <LinearGradient
            colors={
              heroImage
                ? ['rgba(6,10,16,0.55)', 'rgba(6,10,16,0.35)', colors.background]
                : isDark
                  ? ['#0f2a22', '#0c1a20', colors.background]
                  : ['#0e3d31', '#0c2f2a', colors.background]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {!heroImage ? (
            <>
              <View style={styles.blob1} />
              <View style={styles.blob2} />
            </>
          ) : null}

          <View style={[styles.heroContent, { paddingTop: insets.top + SPACING.md }]}>
            <View style={styles.heroTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.greet}>{greeting},</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {user?.firstName || t('portal.client', 'Client')}
                </Text>
              </View>
              <Pressable style={styles.avatar} onPress={() => router.push('/(customer)/(tabs)/profile')} hitSlop={8}>
                <Text style={styles.avatarText}>{initialOf(user)}</Text>
              </Pressable>
            </View>
            {cfg?.name ? (
              <Text style={styles.propName} numberOfLines={1}>
                {cfg.name}
              </Text>
            ) : null}
            {unit?.name ? (
              <Text style={styles.propUnit} numberOfLines={1}>
                {unit.name}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── Action grid ── */}
        <View style={styles.grid}>
          {tiles.map((tile) => {
            const a = ACCENTS[tile.accent];
            return (
              <Pressable key={tile.key} style={[styles.tile, { width: tileW }]} onPress={tile.onPress}>
                <LinearGradient
                  colors={isDark ? a.dark : a.light}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.tileBg}
                >
                  <View style={[styles.tileIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#ffffffcc' }]}>
                    <tile.Glyph size={28} color={a.fg} />
                    {tile.badge ? (
                      <CountBadge count={tile.badge} style={{ position: 'absolute', top: -6, right: -6 }} />
                    ) : null}
                  </View>
                  <Text
                    style={[styles.tileLabel, { color: isDark ? '#f1f5f9' : colors.textPrimary }]}
                    numberOfLines={2}
                  >
                    {tile.label}
                  </Text>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>

        {/* ── Quick report categories ── */}
        {categories.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('portal.quickReport', 'Quick report')}
            </Text>
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
                  <View style={styles.catIcon}>
                    <CategoryGlyph icon={c.icon} color={c.color} size={26} />
                  </View>
                  <Text style={[styles.catLabel, { color: colors.textSecondary }]} numberOfLines={2}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* ── Recent ── */}
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginHorizontal: 0, marginTop: 0 }]}>
            {t('portal.recent', 'Recent')}
          </Text>
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
              onPress={() => {
                if (!isOnPhone(r.id)) router.push(`/(customer)/request/${r.id}`);
              }}
            />
          ))
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View
              style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : COLORS.primaryLight }]}
            >
              <Icon name="checkRead" size={26} color={COLORS.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {t('portal.allClear', 'You’re all caught up')}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {t('portal.allClearSub', 'No open requests. Tap above if something needs fixing.')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
