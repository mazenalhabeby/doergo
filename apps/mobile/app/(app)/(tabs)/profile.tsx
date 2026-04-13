import { useState, useCallback } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Href } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme, type ThemeMode } from '../../../src/contexts/theme-context';
import { usePushNotifications } from '../../../src/hooks/usePushNotifications';
import { useImagePicker } from '../../../src/hooks/useImagePicker';
import { avatarApi, uploadToPresignedUrl } from '../../../src/lib/api';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../../src/lib/constants';
import {
  getRoleLabel,
  getWorkModeLabel,
  getTechnicianTypeLabel,
  Role,
} from '@hbcfield/shared/client';

function getInitials(firstName?: string, lastName?: string): string {
  const f = (firstName || '').charAt(0).toUpperCase();
  const l = (lastName || '').charAt(0).toUpperCase();
  return f + l || '?';
}

const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
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
  const { unregisterPushToken } = usePushNotifications();
  const { pickFromGallery, takePhoto } = useImagePicker();
  const insets = useSafeAreaInsets();

  const [avatarLoading, setAvatarLoading] = useState(false);

  const isTechnician = user?.role === Role.TECHNICIAN;
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const hasAvatar = !!user?.avatarUrl;

  // ---- avatar upload flow ------------------------------------------------

  const uploadAvatar = useCallback(async (uri: string, fileName: string, mimeType: string) => {
    setAvatarLoading(true);
    try {
      // 1. Get presigned URL
      const { uploadUrl, fileUrl } = await avatarApi.getPresignedUrl(fileName, mimeType);

      // 2. Upload to S3
      await uploadToPresignedUrl(uploadUrl, uri, mimeType);

      // 3. Confirm upload (save to DB)
      await avatarApi.confirm(fileUrl);

      // 4. Refresh user data
      await refreshUser();
    } catch (err: any) {
      Alert.alert('Upload Failed', err?.message || 'Could not upload photo. Please try again.');
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
      Alert.alert('Error', err?.message || 'Could not remove photo.');
    } finally {
      setAvatarLoading(false);
    }
  }, [refreshUser]);

  const handleAvatarPress = useCallback(() => {
    if (avatarLoading) return;

    const options = hasAvatar
      ? ['Take Photo', 'Choose from Gallery', 'Remove Photo', 'Cancel']
      : ['Take Photo', 'Choose from Gallery', 'Cancel'];
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
        { text: 'Take Photo', onPress: async () => {
          const photo = await takePhoto();
          if (photo) uploadAvatar(photo.uri, photo.fileName, photo.mimeType);
        }},
        { text: 'Choose from Gallery', onPress: async () => {
          const images = await pickFromGallery();
          if (images.length > 0) {
            const img = images[0]!;
            uploadAvatar(img.uri, img.fileName, img.mimeType);
          }
        }},
      ];
      if (hasAvatar) {
        buttons.push({ text: 'Remove Photo', style: 'destructive', onPress: handleRemoveAvatar });
      }
      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert('Profile Photo', 'Choose an option', buttons);
    }
  }, [avatarLoading, hasAvatar, takePhoto, pickFromGallery, uploadAvatar, handleRemoveAvatar]);

  // ---- handlers -----------------------------------------------------------

  const handleAppearancePress = useCallback(() => {
    const modes: ThemeMode[] = ['system', 'light', 'dark'];
    const options = [...modes.map((m) => THEME_MODE_LABELS[m]), 'Cancel'];
    const cancelIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex },
        (idx) => {
          if (idx !== cancelIndex) setMode(modes[idx]!);
        },
      );
    } else {
      Alert.alert('Appearance', 'Choose a theme', [
        ...modes.map((m) => ({ text: THEME_MODE_LABELS[m], onPress: () => setMode(m) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  }, [setMode]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await unregisterPushToken();
          await logout();
        },
      },
    ]);
  };

  return (
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

        {/* Badges */}
        <View style={styles.badgesRow}>
          <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="briefcase-outline" size={13} color={COLORS.primary} />
            <Text style={styles.badgeText}>{getRoleLabel(user?.role ?? '')}</Text>
          </View>
          {isTechnician && user?.workMode && (
            <View style={[styles.badge, styles.badgeSecondary, { backgroundColor: colors.emeraldLight }]}>
              <Ionicons name="navigate-outline" size={13} color={COLORS.emerald} />
              <Text style={[styles.badgeText, { color: COLORS.emerald }]}>
                {getWorkModeLabel(user.workMode)}
              </Text>
            </View>
          )}
          {isTechnician && user?.technicianType && (
            <View style={[styles.badge, styles.badgeTertiary, { backgroundColor: colors.surfaceRaised }]}>
              <Ionicons name="id-card-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                {getTechnicianTypeLabel(user.technicianType)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── 2. Settings Menu ──────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.menuGroupLabel, { color: colors.textMuted }]}>GENERAL</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card }]}>
          <MenuItem
            icon="notifications-outline"
            iconColor={COLORS.primary}
            iconBg={colors.primaryLight}
            label="Notifications"
            onPress={() => router.push('/profile/notifications' as Href)}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon={THEME_MODE_ICONS[mode] as any}
            iconColor={COLORS.amber}
            iconBg={colors.amberLight}
            label="Appearance"
            onPress={handleAppearancePress}
            trailing={
              <View style={styles.menuTrailingRow}>
                <Text style={[styles.menuTrailingText, { color: colors.textMuted }]}>{THEME_MODE_LABELS[mode]}</Text>
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
            label="Account & Security"
            onPress={() => router.push('/profile/account' as Href)}
            themeColors={colors}
          />
        </View>

        <Text style={[styles.menuGroupLabel, { marginTop: SPACING.xl, color: colors.textMuted }]}>SUPPORT</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card }]}>
          <MenuItem
            icon="help-circle-outline"
            iconColor={COLORS.primary}
            iconBg={colors.primaryLight}
            label="Help Center"
            onPress={() => Linking.openURL('https://hbcfield.com/help').catch(() => {})}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon="chatbubble-ellipses-outline"
            iconColor={COLORS.cyan}
            iconBg={colors.cyanLight}
            label="Contact Support"
            onPress={() => Linking.openURL('mailto:support@hbcfield.com').catch(() => {})}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon="star-outline"
            iconColor={COLORS.warning}
            iconBg={colors.warningLight}
            label="Rate the App"
            onPress={() => Linking.openURL('https://apps.apple.com').catch(() => {})}
            themeColors={colors}
          />
        </View>

        <Text style={[styles.menuGroupLabel, { marginTop: SPACING.xl, color: colors.textMuted }]}>LEGAL</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.card }]}>
          <MenuItem
            icon="document-text-outline"
            iconColor={colors.textSecondary}
            iconBg={colors.surfaceRaised}
            label="Terms of Service"
            onPress={() => Linking.openURL('https://hbcfield.com/terms').catch(() => {})}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon="shield-checkmark-outline"
            iconColor={colors.textSecondary}
            iconBg={colors.surfaceRaised}
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://hbcfield.com/privacy').catch(() => {})}
            themeColors={colors}
          />
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <MenuItem
            icon="information-circle-outline"
            iconColor={colors.textSecondary}
            iconBg={colors.surfaceRaised}
            label="About"
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
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* ── 4. Version Footer ─────────────────────────────────────────── */}
      <Text style={[styles.version, { color: colors.textMuted }]}>HBCField v{appVersion}</Text>
    </ScrollView>
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
