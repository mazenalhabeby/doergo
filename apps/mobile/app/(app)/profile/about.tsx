import { View, Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
} from '../../../src/lib/constants';

export default function AboutScreen() {
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '1';

  return (
    <View style={styles.container}>
      {/* App Info */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="settings" size={40} color={COLORS.primary} />
        </View>
        <Text style={styles.appName}>Doergo</Text>
        <Text style={styles.tagline}>Field Service Management</Text>
      </View>

      {/* Version Info */}
      <View style={styles.section}>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>{appVersion}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Build</Text>
            <Text style={styles.infoValue}>{buildNumber}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Platform</Text>
            <Text style={styles.infoValue}>React Native (Expo)</Text>
          </View>
        </View>
      </View>

      <Text style={styles.copyright}>
        {'\u00A9'} {new Date().getFullYear()} Doergo. All rights reserved.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.slate50,
  },
  header: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl + SPACING.lg,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  appName: {
    fontSize: FONT_SIZE.xxxl + 4,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.slate800,
  },
  tagline: {
    fontSize: FONT_SIZE.base,
    color: COLORS.slate500,
    marginTop: SPACING.xs,
  },
  section: {
    paddingHorizontal: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.slate500,
  },
  infoValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.slate800,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.slate100,
    marginVertical: SPACING.md,
  },
  copyright: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.slate400,
    textAlign: 'center',
    marginTop: SPACING.xxxl,
  },
});
