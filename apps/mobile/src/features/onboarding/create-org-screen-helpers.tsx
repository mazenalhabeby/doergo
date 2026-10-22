import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS } from '@/lib/constants';

/** CreateOrgScreen's module-level helpers, moved here unchanged so its sections can read them too. */
/** Catalog icon keys → Ionicons names (single binding point, like wizard-icons on web). */
export const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  package: 'cube-outline',
  refresh: 'refresh-outline',
  wrench: 'construct-outline',
  alert: 'warning-outline',
  search: 'search-outline',
  inbox: 'file-tray-outline',
  spray: 'water-outline',
  sparkles: 'sparkles-outline',
  wand: 'color-wand-outline',
  shield: 'shield-checkmark-outline',
  door: 'exit-outline',
  ruler: 'resize-outline',
  ticket: 'pricetag-outline',
  mapPin: 'location-outline',
  truck: 'car-outline',
  trees: 'leaf-outline',
  clipboard: 'clipboard-outline',
  grid: 'grid-outline',
  factory: 'business-outline',
  building: 'business-outline',
  hardHat: 'hammer-outline',
  server: 'server-outline',
  sun: 'sunny-outline',
  bug: 'bug-outline',
  folder: 'folder-outline',
  check: 'checkmark-outline',
  settings: 'settings-outline',
  users: 'people-outline',
  user: 'person-outline',
  mail: 'mail-outline',
  checkCircle: 'checkmark-circle-outline',
};

export function ionicon(key: string): keyof typeof Ionicons.glyphMap {
  return ICON_MAP[key] ?? 'ellipse-outline';
}

export const TOTAL_STEPS = 3;

/* ---------------- presentational helpers ---------------- */

export function Kicker({ colors, icon, text }: { colors: { primaryLight?: string }; icon: string; text: string }) {
  return (
    <View style={[styles.kicker, { backgroundColor: COLORS.primaryLight, borderColor: COLORS.successBorder }]}>
      <Ionicons name={ionicon(icon)} size={13} color={COLORS.primaryDark} />
      <Text style={[styles.kickerText, { color: COLORS.primaryDark }]}>{text}</Text>
    </View>
  );
}

export function Chip({
  colors,
  icon,
  label,
  muted,
}: {
  colors: { textSecondary: string; surfaceRaised: string; inputBorder: string };
  icon: string;
  label: string;
  muted?: boolean;
}) {
  return (
    <View style={[
      styles.chip,
      muted
        ? { backgroundColor: colors.surfaceRaised, borderColor: colors.inputBorder }
        : { backgroundColor: COLORS.primaryLight, borderColor: COLORS.successBorder },
    ]}>
      <Ionicons name={ionicon(icon)} size={13} color={muted ? colors.textSecondary : COLORS.primaryDark} />
      <Text style={[styles.chipText, { color: muted ? colors.textSecondary : COLORS.primaryDark }]}>{label}</Text>
    </View>
  );
}

export function SummaryRow({
  colors,
  icon,
  title,
  detail,
  last,
}: {
  colors: { textPrimary: string; textMuted: string; surfaceRaised: string; border: string };
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={[styles.summaryIcon, { backgroundColor: colors.surfaceRaised }]}>
        <Ionicons name={icon} size={17} color={COLORS.primaryDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.summaryTitle, { color: colors.textPrimary }]}>{title}</Text>
        {!!detail && <Text style={[styles.summaryDetail, { color: colors.textMuted }]}>{detail}</Text>}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  progress: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  progressBarTrack: {
    height: 3,
    backgroundColor: 'transparent',
    marginTop: SPACING.sm,
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  progressBarFill: { height: 3, borderRadius: RADIUS.full },
  scrollContent: { padding: SPACING.xl, paddingBottom: SPACING.xxxl },

  kicker: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    marginBottom: SPACING.md,
  },
  kickerText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },

  title: { fontSize: FONT_SIZE.title, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.xs, letterSpacing: -0.3 },
  subtitle: { fontSize: FONT_SIZE.lg, lineHeight: 22, marginBottom: SPACING.xl },
  label: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, marginBottom: SPACING.sm },

  inputContainer: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    overflow: 'hidden',
    minHeight: 54,
    alignItems: 'stretch',
  },
  singleLine: { minHeight: 52 },
  inputIcon: { width: 44, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1 },
  input: { flex: 1, fontSize: FONT_SIZE.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, textAlignVertical: 'top' },
  inputSingle: { textAlignVertical: 'center', paddingVertical: 0 },

  understood: { marginTop: SPACING.lg, borderWidth: 1, borderLeftWidth: 4, borderRadius: RADIUS.md, padding: SPACING.lg, ...SHADOWS.md },
  understoodEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  eyebrow: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  understoodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  understoodIcon: { width: 36, height: 36, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  understoodTitle: { flex: 1, fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },

  chipLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  chipText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginVertical: SPACING.xl },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, textTransform: 'uppercase', letterSpacing: 0.5 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  card: {
    width: '31%',
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 96,
    justifyContent: 'center',
  },
  cardIcon: { width: 40, height: 40, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  cardLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, textAlign: 'center' },

  areaList: { gap: SPACING.sm, marginBottom: SPACING.lg },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 52,
  },
  areaIcon: { width: 32, height: 32, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  areaInput: { flex: 1, fontSize: FONT_SIZE.lg },

  summary: { marginTop: SPACING.xl, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md },
  summaryIcon: { width: 38, height: 38, borderRadius: RADIUS.sm, justifyContent: 'center', alignItems: 'center' },
  summaryTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  summaryDetail: { fontSize: FONT_SIZE.md, marginTop: 2, lineHeight: 18 },

  primaryBtn: { marginTop: SPACING.xl, borderRadius: RADIUS.md, overflow: 'hidden', ...SHADOWS.lg, shadowColor: COLORS.primary },
  btnDisabled: { shadowOpacity: 0.1 },
  primaryBtnGrad: { height: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACING.sm },
  primaryBtnText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
});
