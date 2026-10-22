import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type ThemeMode } from '../../../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, type ThemeColors } from '../../../../lib/constants';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** CustomerProfile's module-level helpers, moved here unchanged so its sections can read them too. */
export const THEME_OPTIONS: { mode: ThemeMode; icon: IconName; key: string; fallback: string }[] = [
  { mode: 'system', icon: 'phone-portrait-outline', key: 'portal.themeSystem', fallback: 'System' },
  { mode: 'light', icon: 'sunny-outline', key: 'portal.themeLight', fallback: 'Light' },
  { mode: 'dark', icon: 'moon-outline', key: 'portal.themeDark', fallback: 'Dark' },
];

export function Group({ title, colors, children }: { title: string; colors: ThemeColors; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: SPACING.lg }}>
      <Text style={[styles.groupTitle, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>
      <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
    </View>
  );
}

export function Row({
  icon,
  label,
  value,
  colors,
  danger,
  onPress,
  last,
}: {
  icon: IconName;
  label: string;
  value?: string;
  colors: ThemeColors;
  danger?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: colors.border, borderBottomWidth: 1 },
        pressed && onPress && { backgroundColor: colors.surface },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name={icon} size={17} color={danger ? COLORS.error : colors.textSecondary} />
      </View>
      <Text style={[styles.rowLabel, { color: danger ? COLORS.error : colors.textPrimary }]}>{label}</Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.textMuted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  avatarText: { fontFamily: 'Outfit_800ExtraBold', fontSize: 28, color: '#fff' },
  name: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.xxl },
  sub: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginTop: 4 },
  groupTitle: {
    fontFamily: 'Outfit_400Regular',
    fontSize: FONT_SIZE.xs,
    letterSpacing: 0.5,
    marginHorizontal: SPACING.lg + 2,
    marginBottom: 7,
  },
  group: { marginHorizontal: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: SPACING.md, paddingVertical: 13 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base },
  rowValue: { flex: 1, textAlign: 'right', fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginRight: 4 },
  // theme
  themeRow: { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.md },
  themePill: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  themeLabel: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm },
  // sign out
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  signOutText: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.base, color: COLORS.error },
  // sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  sheetTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.lg, marginBottom: SPACING.md },
  sheetEmpty: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, paddingVertical: SPACING.md },
  unitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  unitIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  unitName: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, fontWeight: '600' },
  unitAddr: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginTop: 2 },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 13,
    marginBottom: SPACING.sm,
  },
  langFlag: { fontSize: 20 },
  langLabel: { flex: 1, fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base },
});
