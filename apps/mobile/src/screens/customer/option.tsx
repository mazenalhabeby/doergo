import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, FONT_SIZE, type ThemeColors } from '../../lib/constants';

export type StepId = 'category' | 'issue' | 'describe' | 'access' | 'time' | 'location' | 'contact';

export function Option({
  selected,
  onPress,
  label,
  left,
  badge,
  colors,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  left?: React.ReactNode;
  badge?: string;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.opt,
        {
          backgroundColor: selected ? colors.primaryLight : colors.card,
          borderColor: selected ? COLORS.primary : colors.border,
        },
      ]}
    >
      {left}
      <Text style={[styles.optLabel, { color: colors.textPrimary }]}>{label}</Text>
      {badge ? (
        <View style={styles.optBadge}>
          <Text style={styles.optBadgeText}>{badge}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={selected ? COLORS.primary : colors.textMuted} />
      )}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-start' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  back: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.lg },
  topStep: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs, marginTop: 1 },
  progress: {
    height: 6,
    borderRadius: 4,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 4 },
  q: {
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: FONT_SIZE.xxl,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  smartChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  smartText: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    padding: 13,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  optIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  optLabel: { flex: 1, fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, fontWeight: '600' },
  optBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  optBadgeText: { fontFamily: 'Outfit_400Regular', fontSize: 11, color: '#B91C1C' },
  textarea: {
    minHeight: 120,
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: 14,
    fontFamily: 'Outfit_400Regular',
    fontSize: FONT_SIZE.base,
    textAlignVertical: 'top',
  },
  input: {
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: 14,
    fontFamily: 'Outfit_400Regular',
    fontSize: FONT_SIZE.base,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    borderTopWidth: 1,
  },
  cta: { borderRadius: RADIUS.md, paddingVertical: 15, alignItems: 'center' },
  ctaText: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.lg, color: '#fff' },
});
