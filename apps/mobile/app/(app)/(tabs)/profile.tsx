import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Href, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../../src/contexts/auth-context';
import { getCurrentLanguage, supportedLanguages } from '../../../src/i18n';
import { useTheme, type ThemeMode } from '../../../src/contexts/theme-context';
import { useToast } from '../../../src/contexts/toast-context';
import { usePushNotifications } from '../../../src/hooks/usePushNotifications';
import { useImagePicker } from '../../../src/hooks/useImagePicker';
import { avatarApi, userApi } from '../../../src/lib/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../../src/lib/constants';
import { ConfirmSheet, ScreenContainer } from '../../../src/components';
import {
  Role,
} from '@hbcfield/shared/client';

function getInitials(firstName?: string, lastName?: string): string {
  const f = (firstName || '').charAt(0).toUpperCase();
  const l = (lastName || '').charAt(0).toUpperCase();
  return f + l || '?';
}

const THEME_MODE_I18N: Record<ThemeMode, string> = {
  system: 'profile.theme.system',
  light: 'profile.theme.light',
  dark: 'profile.theme.dark',
};

const THEME_MODE_ICONS: Record<ThemeMode, string> = {
  system: 'phone-portrait-outline',
  light: 'sunny-outline',
  dark: 'moon-outline',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const { user, logout, refreshUser } = useAuth();
  const { colors, isDark, mode, setMode } = useTheme();
  const toast = useToast();
  const { t } = useTranslation();
  const { unregisterPushToken } = usePushNotifications();
  const { pickFromGallery, takePhoto } = useImagePicker();
  const insets = useSafeAreaInsets();

  const [avatarLoading, setAvatarLoading] = useState(false);
  const [savingPresence, setSavingPresence] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Availability control (mirrors the web navbar toggle): Available / Busy / Away.
  const handleSetPresence = useCallback(async (presence: 'AVAILABLE' | 'BUSY' | 'AWAY') => {
    setSavingPresence(true);
    try {
      await userApi.setPresence(presence);
      await refreshUser();
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('profile.status.failed', 'Could not update status'));
    } finally {
      setSavingPresence(false);
    }
  }, [refreshUser, toast, t]);
  const hasRefreshed = useRef(false);
  const lastFetchTimeRef = useRef(0);

  // Refresh user data when profile screen is focused (picks up admin edits)
  useFocusEffect(
    useCallback(() => {
      if (hasRefreshed.current) {
        if (Date.now() - lastFetchTimeRef.current < 30000) return;
        lastFetchTimeRef.current = Date.now();
        refreshUser();
      }
      hasRefreshed.current = true;
    }, [refreshUser])
  );

  const isTechnician = user?.role === Role.EMPLOYEE;
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const hasAvatar = !!user?.avatarUrl;

  // ---- avatar upload flow ------------------------------------------------

  const uploadAvatar = useCallback(async (uri: string, fileName: string, mimeType: string) => {
    setAvatarLoading(true);
    try {
      // Upload the avatar (multipart) — returns the new avatar URL
      await avatarApi.upload(uri, fileName, mimeType);

      // Refresh user data
      await refreshUser();
    } catch (err: any) {
      toast.error(t('profile.uploadFailed'), err?.message || t('profile.couldNotUpload'));
    } finally {
      setAvatarLoading(false);
    }
  }, [refreshUser]);

  const handleRemoveAvatar = useCallback(async () => {
    setAvatarLoading(true);
    try {
      await avatarApi.remove();
      await refreshUser();
    } catch (err: any) {
      toast.error(t('common.error'), err?.message || t('profile.couldNotRemove'));
    } finally {
      setAvatarLoading(false);
    }
  }, [refreshUser]);

  const handleAvatarPress = useCallback(() => {
    if (avatarLoading) return;

    const options = hasAvatar
      ? [t('profile.takePhoto'), t('profile.chooseFromGallery'), t('profile.removePhoto'), t('common.cancel')]
      : [t('profile.takePhoto'), t('profile.chooseFromGallery'), t('common.cancel')];
    const cancelIndex = options.length - 1;
    const destructiveIndex = hasAvatar ? 2 : undefined;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex },
        async (idx) => {
          if (idx === 0) {
            const photo = await takePhoto();
            if (photo) uploadAvatar(photo.uri, photo.fileName, photo.mimeType);
          } else if (idx === 1) {
            const images = await pickFromGallery();
            if (images.length > 0) {
              const img = images[0]!;
              uploadAvatar(img.uri, img.fileName, img.mimeType);
            }
          } else if (hasAvatar && idx === 2) {
            handleRemoveAvatar();
          }
        },
      );
    } else {
      // Android fallback using Alert
      const buttons: any[] = [
        { text: t('profile.takePhoto'), onPress: async () => {
          const photo = await takePhoto();
          if (photo) uploadAvatar(photo.uri, photo.fileName, photo.mimeType);
        }},
        { text: t('profile.chooseFromGallery'), onPress: async () => {
          const images = await pickFromGallery();
          if (images.length > 0) {
            const img = images[0]!;
            uploadAvatar(img.uri, img.fileName, img.mimeType);
          }
        }},
      ];
      if (hasAvatar) {
        buttons.push({ text: t('profile.removePhoto'), style: 'destructive', onPress: handleRemoveAvatar });
      }
      buttons.push({ text: t('common.cancel'), style: 'cancel' });
      Alert.alert(t('profile.profilePhoto'), t('profile.chooseOption'), buttons);
    }
  }, [avatarLoading, hasAvatar, takePhoto, pickFromGallery, uploadAvatar, handleRemoveAvatar]);

  // ---- handlers -----------------------------------------------------------

  const handleAppearancePress = useCallback(() => {
    router.push('/profile/appearance' as Href);
  }, []);

  const handleLogout = () => {
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = async () => {
    setShowSignOutConfirm(false);
    await unregisterPushToken();
    await logout();
  };

  return (
    <ScreenContainer width="content">
    <ScrollView
      style={[styles.container, { backgroundColor: colors.surface }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xxxl }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 1. Profile Header ─────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={handleAvatarPress}
          activeOpacity={0.8}
          disabled={avatarLoading}
        >
          {avatarLoading ? (
            <View style={styles.avatar}>
              <ActivityIndicator size="large" color={COLORS.white} />
            </View>
          ) : hasAvatar ? (
            <Image source={{ uri: user!.avatarUrl! }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getInitials(user?.firstName, user?.lastName)}
              </Text>
            </View>
          )}
          <View style={[styles.cameraIconBadge, { borderColor: colors.card }]}>
            <Ionicons name="camera" size={14} color={COLORS.white} />
          </View>
        </TouchableOpacity>

        <Text style={[styles.name, { color: colors.textPrimary }]}>
          {user?.firstName} {user?.lastName}
        </Text>
        <Text style={[styles.email, { color: colors.textSecondary }]}>{user?.email}</Text>

        {/* Identity badges — show the job POSITION only (no ADMIN/EMPLOYEE role
            label) plus specialty for technicians. */}
        {(() => {
          const badges = user?.profileBadges;
          const showSpecialty = badges?.showSpecialty !== false;
          const hasBadges = !!user?.position
            || (isTechnician && showSpecialty && !!user?.specialty);

          if (!hasBadges) return null;

          return (
            <View style={styles.badgesRow}>
              {isTechnician && showSpecialty && !!user?.specialty && (
                <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="construct-outline" size={13} color={COLORS.primary} />
                  <Text style={styles.badgeText}>{user.specialty}</Text>
                </View>
              )}
              {!!user?.position && (
                <View style={[styles.badge, styles.badgeSecondary, { backgroundColor: colors.emeraldLight }]}>
                  <Ionicons name="navigate-outline" size={13} color={COLORS.emerald} />
                  <Text style={[styles.badgeText, { color: COLORS.emerald }]}>
                    {user.position}
                  </Text>
                </View>
              )}
            </View>
          );
        })()}
      </View>

      {/* ── Availability status ──────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.menuGroupLabel, { color: colors.textMuted }]}>{t('profile.status.title', 'Availability')}</Text>
        <View style={[styles.statusRow, { backgroundColor: colors.card }]}>
          {([
            { value: 'AVAILABLE' as const, color: '#22c55e', label: t('profile.status.available', 'Available') },
            { value: 'BUSY' as const, color: '#ef4444', label: t('profile.status.busy', 'Busy') },
            { value: 'AWAY' as const, color: '#f59e0b', label: t('profile.status.away', 'Away') },
          ]).map((opt) => {
            // No "auto" state — default to Available (the login default) when unset.
            const active = (user?.presence ?? 'AVAILABLE') === opt.value;
            return (
              <TouchableOpacity
                key={String(opt.value)}
                style={[
                  styles.statusPill,
                  { borderColor: colors.border },
                  active && { backgroundColor: colors.primaryLight, borderColor: opt.color },
                ]}
                onPress={() => handleSetPresence(opt.value)}
                disabled={savingPresence}
                activeOpacity={0.7}
              >
                <View style={[styles.statusDot, { backgroundColor: opt.color }]} />
                <Text style={[styles.statusPillText, { color: active ? colors.textPrimary : colors.textSecondary }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── 2. Settings Menu ──────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.menuGroupLabel, { color: colors.textMuted }]}>{t('profile.menu.general')}</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card }]}>
          <MenuItem
            icon="chatbubbles-outline"
            iconColor={COLORS.primary}
            iconBg={colors.primaryLight}
            label={t('chat.title', 'Messages')}
            onPress={() => router.push('/chat' as Href)}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon="notifications-outline"
            iconColor={COLORS.primary}
            iconBg={colors.primaryLight}
            label={t('profile.menu.notifications')}
            onPress={() => router.push('/profile/notifications' as Href)}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon={THEME_MODE_ICONS[mode] as any}
            iconColor={COLORS.amber}
            iconBg={colors.amberLight}
            label={t('profile.menu.appearance')}
            onPress={handleAppearancePress}
            trailing={
              <View style={styles.menuTrailingRow}>
                <Text style={[styles.menuTrailingText, { color: colors.textMuted }]}>{t(THEME_MODE_I18N[mode])}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            }
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon="lock-closed-outline"
            iconColor={colors.textSecondary}
            iconBg={colors.surfaceRaised}
            label={t('profile.menu.accountSecurity')}
            onPress={() => router.push('/profile/account' as Href)}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon="language-outline"
            iconColor="#6366f1"
            iconBg={isDark ? '#312e81' : '#e0e7ff'}
            label={t('profile.menu.language')}
            onPress={() => router.push('/profile/language' as Href)}
            trailing={
              <View style={styles.menuTrailingRow}>
                <Text style={[styles.menuTrailingText, { color: colors.textMuted }]}>
                  {supportedLanguages.find(l => l.code === getCurrentLanguage())?.flag}{' '}
                  {supportedLanguages.find(l => l.code === getCurrentLanguage())?.label}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            }
            themeColors={colors}
          />
        </View>

        <Text style={[styles.menuGroupLabel, { marginTop: SPACING.xl, color: colors.textMuted }]}>{t('profile.menu.support')}</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card }]}>
          <MenuItem
            icon="help-circle-outline"
            iconColor={COLORS.primary}
            iconBg={colors.primaryLight}
            label={t('profile.menu.helpCenter')}
            onPress={() => Linking.openURL('https://hbcfield.com/help').catch(() => {})}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon="chatbubble-ellipses-outline"
            iconColor={COLORS.cyan}
            iconBg={colors.cyanLight}
            label={t('profile.menu.contactSupport')}
            onPress={() => router.push('/support' as Href)}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon="star-outline"
            iconColor={COLORS.warning}
            iconBg={colors.warningLight}
            label={t('profile.menu.rateApp')}
            onPress={() => Linking.openURL('https://apps.apple.com').catch(() => {})}
            themeColors={colors}
          />
        </View>

        <Text style={[styles.menuGroupLabel, { marginTop: SPACING.xl, color: colors.textMuted }]}>{t('profile.menu.legal')}</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card }]}>
          <MenuItem
            icon="document-text-outline"
            iconColor={colors.textSecondary}
            iconBg={colors.surfaceRaised}
            label={t('profile.menu.termsOfService')}
            onPress={() => Linking.openURL('https://hbcfield.com/terms').catch(() => {})}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon="shield-checkmark-outline"
            iconColor={colors.textSecondary}
            iconBg={colors.surfaceRaised}
            label={t('profile.menu.privacyPolicy')}
            onPress={() => Linking.openURL('https://hbcfield.com/privacy').catch(() => {})}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon="information-circle-outline"
            iconColor={colors.textSecondary}
            iconBg={colors.surfaceRaised}
            label={t('profile.menu.about')}
            onPress={() => router.push('/profile/about' as Href)}
            trailing={
              <View style={styles.menuTrailingRow}>
                <Text style={[styles.menuTrailingText, { color: colors.textMuted }]}>v{appVersion}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            }
            themeColors={colors}
          />
        </View>
      </View>

      {/* ── 3. Sign Out ───────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.logoutButton, { backgroundColor: colors.errorLight }]}
        onPress={handleLogout}
        activeOpacity={0.8}
      >
        <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
        <Text style={styles.logoutText}>{t('profile.signOutButton')}</Text>
      </TouchableOpacity>

      {/* ── 4. Version Footer ─────────────────────────────────────────── */}
      <Text style={[styles.version, { color: colors.textMuted }]}>{t('profile.versionFooter', { version: appVersion })}</Text>

      <ConfirmSheet
        visible={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        onConfirm={confirmSignOut}
        title={t('profile.signOutConfirmTitle')}
        message={t('profile.signOutConfirmMessage')}
        confirmLabel={t('profile.signOutButton')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        icon="log-out-outline"
      />
    </ScrollView>
    </ScreenContainer>
  );
}

// ---------------------------------------------------------------------------
// Reusable MenuItem sub-component
// ---------------------------------------------------------------------------

function MenuItem({
  icon,
  iconColor,
  iconBg,
  label,
  onPress,
  trailing,
  themeColors,
}: {
  icon: string;
  iconColor: string;
  iconBg: string;
  label: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  themeColors: import('../../../src/lib/constants').ThemeColors;
}) {
  return (
    <TouchableOpacity
      style={styles.menuItem}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <Text style={[styles.menuText, { color: themeColors.textPrimary }]}>{label}</Text>
      {trailing || <Ionicons name="chevron-forward" size={18} color={themeColors.textMuted} />}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Header ──
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    borderBottomWidth: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.slate600,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  name: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: 2,
  },
  email: {
    fontSize: FONT_SIZE.base,
    marginBottom: SPACING.md,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 1,
    borderRadius: RADIUS.full,
    gap: SPACING.xs,
  },
  badgeSecondary: {},
  badgeTertiary: {},
  badgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  },

  // ── Section ──
  section: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },

  // ── Availability status ──
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // ── Menu ──
  menuGroupLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
    paddingLeft: SPACING.xs,
  },
  menuCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.lg,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  menuText: {
    flex: 1,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.medium,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 36 + SPACING.lg + SPACING.md, // icon width + padding + gap
  },
  menuTrailingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  menuTrailingText: {
    fontSize: FONT_SIZE.sm,
  },

  // ── Logout ──
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xxl,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
    gap: SPACING.sm,
  },
  logoutText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.error,
  },

  // ── Footer ──
  version: {
    textAlign: 'center',
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xl,
  },
});

