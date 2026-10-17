import { StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../../lib/constants';
import { type AccentKey } from './use-customer-home';

/** CustomerHome's module-level helpers, moved here unchanged so its sections can read them too. */
export const ACCENTS: Record<AccentKey, { dark: [string, string]; light: [string, string]; fg: string }> = {
  blue:   { dark: ['#18293f', '#0f1a2a'], light: ['#eaf1fe', '#dce8fd'], fg: '#3b82f6' },
  green:  { dark: ['#123227', '#0c2019'], light: ['#e7f7ef', '#d6f0e2'], fg: '#10b981' },
  purple: { dark: ['#241d3a', '#171226'], light: ['#f1ecfb', '#e6def8'], fg: '#8b5cf6' },
  teal:   { dark: ['#123236', '#0c2124'], light: ['#e6f5f4', '#d4efeb'], fg: '#14b8a6' },
  amber:  { dark: ['#332810', '#201908'], light: ['#fdf3e0', '#fae8cb'], fg: '#f59e0b' },
};

export const styles = StyleSheet.create({
  // Hero
  hero: { minHeight: 210, paddingBottom: SPACING.xl, overflow: 'hidden' },
  blob1: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(16,185,129,0.16)',
  },
  blob2: { position: 'absolute', top: 40, right: 90, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(45,212,191,0.10)' },
  heroContent: { paddingHorizontal: SPACING.lg },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  greet: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, color: 'rgba(255,255,255,0.85)' },
  name: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.title, color: '#fff', marginTop: 1 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarText: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.xl, color: '#fff' },
  propName: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.lg, color: '#fff', marginTop: SPACING.md, fontWeight: '600' },
  propUnit: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, paddingHorizontal: SPACING.lg, marginTop: -SPACING.sm },
  tile: { borderRadius: 22, overflow: 'hidden' },
  tileBg: { minHeight: 132, borderRadius: 22, padding: SPACING.md, justifyContent: 'space-between' },
  tileIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tileBadgeText: { color: '#fff', fontFamily: 'Outfit_800ExtraBold', fontSize: 11 },
  tileLabel: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.base, lineHeight: 20, marginTop: SPACING.sm },

  // Sections
  sectionTitle: {
    fontFamily: 'Outfit_800ExtraBold',
    fontSize: FONT_SIZE.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  seeAll: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, fontWeight: '600' },

  // Category chips
  catChip: { width: 76, alignItems: 'center', gap: 8 },
  catIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.xs, textAlign: 'center', lineHeight: 14 },

  // Empty
  emptyCard: {
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  emptyTitle: { fontFamily: 'Outfit_800ExtraBold', fontSize: FONT_SIZE.base },
  emptySub: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, textAlign: 'center', marginTop: 3, lineHeight: 18 },
});
