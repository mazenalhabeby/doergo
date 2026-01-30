import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/contexts/auth-context';
import { usePushNotifications } from '../../../src/hooks/usePushNotifications';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  ROUTES,
} from '../../../src/lib/constants';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { unregisterPushToken } = usePushNotifications();
  const insets = useSafeAreaInsets();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            // Unregister push token before logging out
            await unregisterPushToken();
            await logout();
            router.replace(ROUTES.login as Href);
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarLarge}>
          <Ionicons name="person" size={40} color={COLORS.primary} />
        </View>
        <Text style={styles.userName}>
          {user?.firstName} {user?.lastName}
        </Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Ionicons name="briefcase-outline" size={14} color={COLORS.primary} />
          <Text style={styles.roleText}>Worker</Text>
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
          <View style={styles.menuIconContainer}>
            <Ionicons name="notifications-outline" size={22} color={COLORS.slate500} />
          </View>
          <Text style={styles.menuText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.slate300} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
          <View style={styles.menuIconContainer}>
            <Ionicons name="location-outline" size={22} color={COLORS.slate500} />
          </View>
          <Text style={styles.menuText}>Location Settings</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.slate300} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
          <View style={styles.menuIconContainer}>
            <Ionicons name="help-circle-outline" size={22} color={COLORS.slate500} />
          </View>
          <Text style={styles.menuText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.slate300} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
          <View style={styles.menuIconContainer}>
            <Ionicons name="information-circle-outline" size={22} color={COLORS.slate500} />
          </View>
          <Text style={styles.menuText}>About</Text>
          <Ionicons name="chevron-forward" size={20} color={COLORS.slate300} />
        </TouchableOpacity>
      </View>

      {/* Logout Button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.8}
      >
        <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* Version */}
      <Text style={styles.version}>Version 1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.slate50,
  },
  profileHeader: {
    backgroundColor: COLORS.white,
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xxl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.slate100,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  userName: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.slate800,
    marginBottom: SPACING.xs,
  },
  userEmail: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
    marginBottom: SPACING.md,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.xl,
    gap: SPACING.xs + 2,
  },
  roleText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  },
  menuContainer: {
    backgroundColor: COLORS.white,
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.slate100,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm + 2,
    backgroundColor: COLORS.slate50,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  menuText: {
    flex: 1,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.slate700,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorLight,
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
  version: {
    textAlign: 'center',
    fontSize: FONT_SIZE.md,
    color: COLORS.slate400,
    marginTop: SPACING.xxl,
  },
});
