import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { SheetHeader } from '../../../src/components';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../../../src/lib/constants';

const PREFS_KEY = 'hbcfield_notification_prefs';

interface NotificationPrefs {
  tasks: boolean;
  attendance: boolean;
  timeOff: boolean;
}

const defaultPrefs: NotificationPrefs = {
  tasks: true,
  attendance: true,
  timeOff: true,
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');

  useEffect(() => {
    loadPrefs();
    checkPermission();
  }, []);

  const loadPrefs = async () => {
    try {
      const stored = await AsyncStorage.getItem(PREFS_KEY);
      if (stored) {
        setPrefs(JSON.parse(stored));
      }
    } catch {
      // Use defaults
    }
  };

  const checkPermission = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status);
  };

  const updatePref = async (key: keyof NotificationPrefs, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(updated));
  };

  const openSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <SheetHeader />
      {/* Permission Status */}
      <View style={styles.section}>
        <View style={[styles.permissionCard, { backgroundColor: colors.card }]}>
          <View style={styles.permissionRow}>
            <Ionicons
              name={permissionStatus === 'granted' ? 'checkmark-circle' : 'alert-circle'}
              size={22}
              color={permissionStatus === 'granted' ? COLORS.success : COLORS.warning}
            />
            <View style={styles.permissionContent}>
              <Text style={[styles.permissionTitle, { color: colors.textPrimary }]}>{t('profile.notifications.pushNotifications')}</Text>
              <Text style={[styles.permissionStatus, { color: colors.textSecondary }]}>
                {permissionStatus === 'granted' ? t('profile.notifications.enabled') : t('profile.notifications.disabled')}
              </Text>
            </View>
            {permissionStatus !== 'granted' && (
              <TouchableOpacity style={[styles.settingsButton, { backgroundColor: colors.primaryLight }]} onPress={openSettings}>
                <Text style={styles.settingsButtonText}>{t('profile.notifications.settings')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Notification Categories */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{t('profile.notifications.categories')}</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Ionicons name="clipboard-outline" size={20} color={COLORS.primary} />
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>{t('profile.notifications.tasks')}</Text>
                <Text style={[styles.toggleDescription, { color: colors.textSecondary }]}>{t('profile.notifications.tasksDescription')}</Text>
              </View>
            </View>
            <Switch
              value={prefs.tasks}
              onValueChange={(v) => updatePref('tasks', v)}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={prefs.tasks ? COLORS.primary : colors.textMuted}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Ionicons name="time-outline" size={20} color={COLORS.success} />
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>{t('profile.notifications.attendance')}</Text>
                <Text style={[styles.toggleDescription, { color: colors.textSecondary }]}>{t('profile.notifications.attendanceDescription')}</Text>
              </View>
            </View>
            <Switch
              value={prefs.attendance}
              onValueChange={(v) => updatePref('attendance', v)}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={prefs.attendance ? COLORS.primary : colors.textMuted}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.warning} />
              <View style={styles.toggleTextContainer}>
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>{t('profile.notifications.timeOff')}</Text>
                <Text style={[styles.toggleDescription, { color: colors.textSecondary }]}>{t('profile.notifications.timeOffDescription')}</Text>
              </View>
            </View>
            <Switch
              value={prefs.timeOff}
              onValueChange={(v) => updatePref('timeOff', v)}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={prefs.timeOff ? COLORS.primary : colors.textMuted}
            />
          </View>
        </View>
      </View>

      <Text style={[styles.footerNote, { color: colors.textMuted }]}>
        {t('profile.notifications.footerNote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    textTransform: 'uppercase' as const,
    marginBottom: SPACING.sm,
  },
  permissionCard: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  permissionContent: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.medium,
  },
  permissionStatus: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  settingsButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  settingsButtonText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  },
  card: {
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  toggleTextContainer: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.medium,
  },
  toggleDescription: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: SPACING.md,
  },
  footerNote: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
    marginTop: SPACING.xxl,
    lineHeight: 18,
  },
});
