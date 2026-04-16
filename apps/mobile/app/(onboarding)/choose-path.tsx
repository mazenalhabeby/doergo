import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { CreateOrgIcon, JoinOrgIcon, InvitationIcon } from '../../src/components';
import { useAuth } from '../../src/contexts/auth-context';
import { useTheme } from '../../src/contexts/theme-context';
import { useAuthAnimations } from '../../src/hooks/useAuthAnimations';
import { onboardingApi } from '../../src/lib/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ROUTES,
} from '../../src/lib/constants';

const PATH_CONFIGS = [
  {
    id: 'create',
    titleKey: 'onboarding.choosePath.createOrg.title',
    descriptionKey: 'onboarding.choosePath.createOrg.description',
    IconComponent: CreateOrgIcon,
    tagKey: 'onboarding.choosePath.createOrg.tag',
    route: ROUTES.createOrg,
    accentColors: [COLORS.primary, COLORS.inProgress] as [string, string],
    iconBg: COLORS.primaryLight,
    tagBg: COLORS.primaryLight,
    accentColor: COLORS.primary,
  },
  {
    id: 'join',
    titleKey: 'onboarding.choosePath.joinOrg.title',
    descriptionKey: 'onboarding.choosePath.joinOrg.description',
    IconComponent: JoinOrgIcon,
    tagKey: 'onboarding.choosePath.joinOrg.tag',
    route: ROUTES.joinOrg,
    accentColors: [COLORS.purple, COLORS.purple] as [string, string],
    iconBg: COLORS.purpleLight,
    tagBg: COLORS.purpleLight,
    accentColor: COLORS.purple,
  },
  {
    id: 'invitation',
    titleKey: 'onboarding.choosePath.useInvitation.title',
    descriptionKey: 'onboarding.choosePath.useInvitation.description',
    IconComponent: InvitationIcon,
    tagKey: 'onboarding.choosePath.useInvitation.tag',
    route: ROUTES.useInvitation,
    accentColors: [COLORS.emerald, COLORS.success] as [string, string],
    iconBg: COLORS.emeraldLight,
    tagBg: COLORS.emeraldLight,
    accentColor: COLORS.emerald,
  },
];

export default function ChoosePathScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [isChecking, setIsChecking] = useState(true);

  // Animations (autoStart=false because we start after checking pending request)
  const {
    fadeAnim,
    slideAnim,
    orb1TranslateY,
    orb2TranslateY,
    startAnimations: startAuthAnimations,
  } = useAuthAnimations({ slideOffset: 20, duration: 600, orb1Offset: -15, orb2Offset: 12, autoStart: false });
  const cardAnims = useRef(PATH_CONFIGS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    checkPendingRequest();
  }, []);

  const startAnimations = () => {
    startAuthAnimations();

    // Staggered card animations
    cardAnims.forEach((anim, index) => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 500,
        delay: 200 + index * 120,
        useNativeDriver: true,
      }).start();
    });
  };

  const checkPendingRequest = async () => {
    try {
      const status = await onboardingApi.getStatus();
      if (status.hasPendingJoinRequest) {
        router.replace(ROUTES.pendingApproval as Href);
        return;
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    } finally {
      setIsChecking(false);
      startAnimations();
    }
  };

  if (isChecking) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const userInitial = user?.firstName?.charAt(0)?.toUpperCase() || '?';

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Premium Header */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <LinearGradient
            colors={[COLORS.slate900, COLORS.slate800, COLORS.slate900]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.header, { paddingTop: insets.top + SPACING.xl }]}
          >
            {/* Animated Orbs */}
            <Animated.View style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1TranslateY }] }]}>
              <LinearGradient colors={['rgba(37, 99, 235, 0.35)', 'rgba(37, 99, 235, 0)']} style={styles.orbGradient} />
            </Animated.View>
            <Animated.View style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2TranslateY }] }]}>
              <LinearGradient colors={['rgba(139, 92, 246, 0.25)', 'rgba(139, 92, 246, 0)']} style={styles.orbGradient} />
            </Animated.View>

            <View style={styles.headerContent}>
              {/* Avatar */}
              <View style={styles.avatarWrapper}>
                <LinearGradient
                  colors={[COLORS.primary, COLORS.inProgress]}
                  style={styles.avatar}
                >
                  <Text style={styles.avatarText}>{userInitial}</Text>
                </LinearGradient>
                <View style={styles.avatarRing} />
              </View>

              <Text style={styles.welcomeText}>
                {t('onboarding.choosePath.welcome', { name: user?.firstName })}
              </Text>
              <Text style={styles.subtitleText}>
                {t('onboarding.choosePath.subtitle')}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Path Cards */}
        <View style={styles.cardsContainer}>
          {PATH_CONFIGS.map((path, index) => {
            const cardOpacity = cardAnims[index]!;
            const cardTranslateY = cardOpacity.interpolate({
              inputRange: [0, 1],
              outputRange: [30, 0],
            });

            return (
              <Animated.View
                key={path.id}
                style={{ opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }}
              >
                <TouchableOpacity
                  style={[styles.pathCard, { backgroundColor: colors.card }]}
                  onPress={() => router.push(path.route as Href)}
                  activeOpacity={0.7}
                >
                  {/* Left accent bar */}
                  <LinearGradient
                    colors={path.accentColors}
                    style={styles.cardAccent}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                  />

                  <View style={styles.cardBody}>
                    {/* Top row: icon + tag */}
                    <View style={styles.cardTopRow}>
                      <View style={[styles.iconCircle, { backgroundColor: path.iconBg }]}>
                        <path.IconComponent size={30} color={path.accentColor} />
                      </View>
                      <View style={[styles.tagBadge, { backgroundColor: path.tagBg }]}>
                        <Text style={[styles.tagText, { color: path.accentColor }]}>{t(path.tagKey)}</Text>
                      </View>
                    </View>

                    {/* Title + description */}
                    <Text style={[styles.pathTitle, { color: colors.textPrimary }]}>{t(path.titleKey)}</Text>
                    <Text style={[styles.pathDescription, { color: colors.textSecondary }]}>{t(path.descriptionKey)}</Text>

                    {/* CTA row */}
                    <View style={styles.ctaRow}>
                      <Text style={[styles.ctaText, { color: path.accentColor }]}>{t('common.getStarted')}</Text>
                      <View style={[styles.ctaArrow, { backgroundColor: path.tagBg }]}>
                        <Ionicons name="arrow-forward" size={14} color={path.accentColor} />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <Animated.View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.sm, opacity: fadeAnim, borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Ionicons name="log-out-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.logoutText, { color: colors.textMuted }]}>{t('onboarding.choosePath.signOut')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Header
  header: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl + SPACING.lg,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    top: -40,
    right: -40,
    width: 160,
    height: 160,
  },
  orb2: {
    bottom: -20,
    left: -40,
    width: 140,
    height: 140,
  },
  orbGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  headerContent: {
    alignItems: 'center',
    zIndex: 10,
  },

  // Avatar
  avatarWrapper: {
    marginBottom: SPACING.lg,
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
  avatarRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: 'rgba(37, 99, 235, 0.3)',
  },

  welcomeText: {
    fontSize: 24,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  subtitleText: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.slate400,
  },

  // Cards
  cardsContainer: {
    padding: SPACING.xl,
    paddingTop: SPACING.xxl,
    gap: SPACING.md,
  },
  pathCard: {
    flexDirection: 'row',
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  cardAccent: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: SPACING.lg,
    paddingLeft: SPACING.lg,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagBadge: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  tagText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0.3,
  },
  pathTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.xs,
  },
  pathDescription: {
    fontSize: FONT_SIZE.base,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  ctaText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },
  ctaArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Footer
  footer: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.lg,
  },
  logoutText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
  },
});
