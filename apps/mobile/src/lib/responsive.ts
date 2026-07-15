// =============================================================================
// RESPONSIVE ENGINE
// -----------------------------------------------------------------------------
// One source of truth for adapting the phone-first UI to tablets / landscape.
//
// Key rule: we NEVER stretch content edge-to-edge on a big screen. We constrain
// readable content to a max width (via <ScreenContainer>) and switch lists to
// grids / master-detail. Phone rendering is unchanged (isTablet === false).
//
// Built on useWindowDimensions() so every value re-computes on ROTATION — the
// old `Dimensions.get('window')` snapshots did not, which broke tablet rotate.
// =============================================================================

import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

// Breakpoints in dp/points (device-independent).
//  - The smallest tablets (7") and iPad mini portrait (744) sit at ~600+.
//  - "large" = roomy enough for 3 columns / side-by-side master-detail.
export const BREAKPOINTS = {
  tablet: 600,
  large: 900,
} as const;

export interface Responsive {
  /** Live window width (updates on rotation). */
  width: number;
  /** Live window height (updates on rotation). */
  height: number;
  /** True on tablets. Based on the SHORTEST side so a phone in landscape is NOT a tablet. */
  isTablet: boolean;
  /** True on large tablets (12.9" iPad, big Android slates). */
  isLargeTablet: boolean;
  /** Current orientation. */
  isLandscape: boolean;
  /** Column count for grid lists (1 phone · 2 tablet · 3 large-landscape). */
  columns: number;
  /** Max width for a single readable content column (forms, detail, prose). */
  contentMaxWidth: number;
  /** Max width for a grid/list region (wider than a single column). */
  gridMaxWidth: number;
  /** Whether to render list+detail side-by-side (master-detail). */
  isSplit: boolean;
  /** Uniform scale factor for opt-in spacing/type bumps (1 phone · ~1.15 tablet). */
  scale: number;
  /** Scale a spacing/size value for the current device. */
  rs: (value: number) => number;
  /** Scale a font size (gentler curve than rs so text doesn't get huge). */
  rf: (value: number) => number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const shortest = Math.min(width, height);
    const isTablet = shortest >= BREAKPOINTS.tablet;
    const isLargeTablet = shortest >= BREAKPOINTS.large;
    const isLandscape = width > height;

    // Grid columns: phones stay single-column; tablets get 2, large landscape 3.
    let columns = 1;
    if (isTablet) columns = isLargeTablet && isLandscape ? 3 : 2;

    // Master-detail (list + detail side-by-side) needs real horizontal room:
    // ~1000dp fits a 380 list + 620 detail. True on a 13" iPad in portrait and
    // on most tablets in landscape; false on phones and small tablets.
    const isSplit = width >= 1000;

    const scale = isLargeTablet ? 1.2 : isTablet ? 1.12 : 1;
    const fontScale = isLargeTablet ? 1.12 : isTablet ? 1.08 : 1;

    return {
      width,
      height,
      isTablet,
      isLargeTablet,
      isLandscape,
      columns,
      contentMaxWidth: isTablet ? 680 : width,
      // Cap tied to column count (which is already orientation-aware), so a
      // 2-col grid stays comfortably capped even on a large tablet in PORTRAIT
      // instead of stretching edge-to-edge.
      gridMaxWidth: columns >= 3 ? 1200 : columns === 2 ? 860 : width,
      isSplit,
      scale,
      rs: (v: number) => Math.round(v * scale),
      rf: (v: number) => Math.round(v * fontScale),
    };
  }, [width, height]);
}
