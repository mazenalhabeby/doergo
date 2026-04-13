import { StyleSheet } from 'react-native';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../../lib/constants';

// Shared styles used across AdminDashboard, FullTimeHome, and FreelancerHome
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor provided inline via colors.surface
  },
  scrollView: {
    flex: 1,
  },

  // Welcome Section
  welcomeSection: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  welcomeGreeting: {
    fontSize: FONT_SIZE.base,
    // color provided inline via colors.textMuted
  },
  welcomeName: {
    fontSize: FONT_SIZE.title,
    fontWeight: FONT_WEIGHT.bold,
    // color provided inline via colors.textPrimary
  },

  // Section title (used by FullTimeHome + AdminDashboard)
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.semibold,
    // color provided inline via colors.textPrimary
    marginBottom: SPACING.md,
  },

  // Stats Grid (shared between Admin + Freelancer)
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    gap: SPACING.md,
  },
  statCard: {
    width: '47%',
    // backgroundColor provided inline via colors.card
    borderRadius: RADIUS.md,
    padding: SPACING.md + 2,
    ...SHADOWS.md,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statNumber: {
    fontSize: FONT_SIZE.title,
    fontWeight: FONT_WEIGHT.bold,
    // color provided inline via colors.textPrimary
  },
  statLabel: {
    fontSize: FONT_SIZE.sm,
    // color provided inline via colors.textMuted
  },

  // Button disabled
  buttonDisabled: {
    opacity: 0.6,
  },
});

// Re-export constants for convenience
export { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS };
