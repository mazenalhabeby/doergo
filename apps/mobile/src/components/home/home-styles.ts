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

  /*
    The home screen's action row: a tinted icon tile, a title and one line under
    it, a chevron.

    Here rather than in the component that happened to need it first, because
    there are now two of them stacked — Clock In and the documents reminder —
    and two cards a few pixels apart in padding, radius, icon size or background
    is the single most obvious way for a screen to look unfinished. Sharing the
    shell makes them impossible to drift apart.

    Colour is the caller's: the surface comes in as `colors.card`, and the tone
    lives in the icon tile, which is the ONLY thing that should differ between
    an ordinary action and an urgent one.
  */
  actionCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    ...SHADOWS.sm,
  },
  actionCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCardText: {
    flex: 1,
  },
  actionCardTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
  },
  actionCardSubtitle: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
});

// Re-export constants for convenience
export { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS };
