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
import { CreateOrgIcon, JoinOrgIcon, InvitationIcon } from '../../src/components';
import { useAuth } from '../../src/contexts/auth-context';
import { onboardingApi } from '../../src/lib/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ROUTES,
} from '../../src/lib/constants';

const PATHS = [
  {
    id: 'create',
    title: 'Create Organization',
    description: 'Set up your company workspace and invite your team to collaborate',
    IconComponent: CreateOrgIcon,
    tag: 'For Admins',
    route: ROUTES.createOrg,
    accentColors: ['#2563EB', '#3b82f6'] as [string, string],
    iconBg: '#dbeafe',
    tagBg: '#eff6ff',
    accentColor: '#2563EB',
  },
  {
    id: 'join',
    title: 'Join Organization',
    description: "Enter your organization's code to request access as a team member",
    IconComponent: JoinOrgIcon,
    tag: 'Have a Code',
    route: ROUTES.joinOrg,
    accentColors: ['#7c3aed', '#8b5cf6'] as [string, string],
    iconBg: '#ede9fe',
    tagBg: '#f5f3ff',
    accentColor: '#7c3aed',
  },
  {
    id: 'invitation',
    title: 'Use Invitation',
    description: 'Accept a personal invitation code from your employer or team lead',
    IconComponent: InvitationIcon,
    tag: 'Invited',
    route: ROUTES.useInvitation,
    accentColors: ['#059669', '#10b981'] as [string, string],
    iconBg: '#d1fae5',
    tagBg: '#ecfdf5',
    accentColor: '#059669',
  },
];

export default function ChoosePathScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [isChecking, setIsChecking] = useState(true);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const cardAnims = useRef(PATHS.map(() => new Animated.Value(0))).current;
  const orb1Anim = useRef(new Animated.Value(0)).current;
  const orb2Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    checkPendingRequest();
  }, []);

  const startAnimations = () => {
    // Header fade in
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    // Staggered card animations
    cardAnims.forEach((anim, index) => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 500,
        delay: 200 + index * 120,
        useNativeDriver: true,
      }).start();
    });

    // Floating orbs
    Animated.loop(
      Animated.sequence([
        Animated.timing(orb1Anim, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(orb1Anim, { toValue: 0, duration: 3000, useNativeDriver: true }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(orb2Anim, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(orb2Anim, { toValue: 0, duration: 4000, useNativeDriver: true }),
      ]),
    ).start();
  };

  const orb1TranslateY = orb1Anim.interpolate({ inputRange: [0, 1], outputRange: [0, -15] });
  const orb2TranslateY = orb2Anim.interpolate({ inputRange: [0, 1], outputRange: [0, 12] });

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
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const userInitial = user?.firstName?.charAt(0)?.toUpperCase() || '?';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Premium Header */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <LinearGradient
            colors={['#0f172a', '#1e293b', '#0f172a']}
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
                  colors={[COLORS.primary, '#3b82f6']}
                  style={styles.avatar}
                >
                  <Text style={styles.avatarText}>{userInitial}</Text>
                </LinearGradient>
                <View style={styles.avatarRing} />
              </View>

              <Text style={styles.welcomeText}>
                Welcome, {user?.firstName}!
              </Text>
              <Text style={styles.subtitleText}>
                Choose how you'd like to get started
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Path Cards */}
        <View style={styles.cardsContainer}>
          {PATHS.map((path, index) => {
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
                  style={styles.pathCard}
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
                        <Text style={[styles.tagText, { color: path.accentColor }]}>{path.tag}</Text>
                      </View>
                    </View>

                    {/* Title + description */}
                    <Text style={styles.pathTitle}>{path.title}</Text>
                    <Text style={styles.pathDescription}>{path.description}</Text>

                    {/* CTA row */}
                    <View style={styles.ctaRow}>
                      <Text style={[styles.ctaText, { color: path.accentColor }]}>Get started</Text>
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
      <Animated.View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.sm, opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Ionicons name="log-out-outline" size={16} color={COLORS.slate400} />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.slate50,
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
    backgroundColor: COLORS.white,
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
    color: COLORS.slate800,
    marginBottom: SPACING.xs,
  },
  pathDescription: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
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
    borderTopColor: COLORS.slate200,
    backgroundColor: COLORS.white,
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
    color: COLORS.slate400,
    fontWeight: FONT_WEIGHT.medium,
  },
});
