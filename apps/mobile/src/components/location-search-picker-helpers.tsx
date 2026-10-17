import { StyleSheet, Platform } from 'react-native';
import { SPACING, RADIUS, FONT_SIZE, SHADOWS } from '../lib/constants';

/** LocationSearchPicker's module-level helpers, moved here unchanged so its sections can read them too. */
export const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
    zIndex: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? SPACING.md : SPACING.xs,
    gap: SPACING.sm,
    zIndex: 11,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.base,
    paddingVertical: Platform.OS === 'ios' ? 0 : SPACING.sm,
  },
  resultsContainer: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    zIndex: 12,
    ...SHADOWS.md,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  resultText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
  },
  mapContainer: {
    height: 220,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
  },
  map: {
    flex: 1,
  },
  myLocationButton: {
    position: 'absolute',
    bottom: SPACING.sm,
    right: SPACING.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coordsText: {
    fontSize: FONT_SIZE.xs,
  },
});
