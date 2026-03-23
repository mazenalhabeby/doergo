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
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../../../src/lib/constants';

const PREFS_KEY = 'doergo_notification_prefs';

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
    <View style={styles.container}>
      {/* Permission Status */}
      <View style={styles.section}>
        <View style={styles.permissionCard}>
          <View style={styles.permissionRow}>
            <Ionicons
              name={permissionStatus === 'granted' ? 'checkmark-circle' : 'alert-circle'}
              size={22}
              color={permissionStatus === 'granted' ? COLORS.success : COLORS.warning}
            />
            <View style={styles.permissionContent}>
              <Text style={styles.permissionTitle}>Push Notifications</Text>
              <Text style={styles.permissionStatus}>
                {permissionStatus === 'granted' ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
            {permissionStatus !== 'granted' && (
              <TouchableOpacity style={styles.settingsButton} onPress={openSettings}>
                <Text style={styles.settingsButtonText}>Settings</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Notification Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Ionicons name="clipboard-outline" size={20} color={COLORS.primary} />
              <View>
                <Text style={styles.toggleLabel}>Tasks</Text>
                <Text style={styles.toggleDescription}>New assignments, status changes, comments</Text>
              </View>
            </View>
            <Switch
              value={prefs.tasks}
              onValueChange={(v) => updatePref('tasks', v)}
              trackColor={{ false: COLORS.slate200, true: COLORS.primaryLight }}
              thumbColor={prefs.tasks ? COLORS.primary : COLORS.slate400}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Ionicons name="time-outline" size={20} color={COLORS.success} />
              <View>
                <Text style={styles.toggleLabel}>Attendance</Text>
                <Text style={styles.toggleDescription}>Clock-in/out reminders</Text>
              </View>
            </View>
            <Switch
              value={prefs.attendance}
              onValueChange={(v) => updatePref('attendance', v)}
              trackColor={{ false: COLORS.slate200, true: COLORS.primaryLight }}
              thumbColor={prefs.attendance ? COLORS.primary : COLORS.slate400}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.warning} />
              <View>
                <Text style={styles.toggleLabel}>Time Off</Text>
                <Text style={styles.toggleDescription}>Request approvals and updates</Text>
              </View>
            </View>
            <Switch
              value={prefs.timeOff}
              onValueChange={(v) => updatePref('timeOff', v)}
              trackColor={{ false: COLORS.slate200, true: COLORS.primaryLight }}
              thumbColor={prefs.timeOff ? COLORS.primary : COLORS.slate400}
            />
          </View>
        </View>
      </View>

      <Text style={styles.footerNote}>
        Notification preferences are stored locally. Push notification permissions are managed in your device settings.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.slate50,
  },
  section: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.slate500,
    textTransform: 'uppercase' as const,
    marginBottom: SPACING.sm,
  },
  permissionCard: {
    backgroundColor: COLORS.white,
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
    color: COLORS.slate800,
  },
  permissionStatus: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
    marginTop: 2,
  },
  settingsButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
  },
  settingsButtonText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
  },
  card: {
    backgroundColor: COLORS.white,
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
  toggleLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.slate800,
  },
  toggleDescription: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate500,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.slate100,
    marginVertical: SPACING.md,
  },
  footerNote: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate400,
    textAlign: 'center',
    paddingHorizontal: SPACING.xxl,
    marginTop: SPACING.xxl,
    lineHeight: 18,
  },
});
