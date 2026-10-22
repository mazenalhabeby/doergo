import { type ViewStyle } from 'react-native';
import { useResponsive } from '../lib/responsive';

/**
 * The tablet width cap: a screen's header and content stop at a comfortable
 * column and sit centred, instead of stretching edge to edge.
 *
 * Style helper for a view or a FlatList/ScrollView `contentContainerStyle`.
 * Spread AFTER your existing content style.
 */
export function centeredContent(maxWidth: number): ViewStyle {
  return { width: '100%', maxWidth, alignSelf: 'center' };
}

/**
 * The cap as a style, for a screen that does not pick its own number:
 *  - 'content' → single readable column (forms, detail, prose)
 *  - 'grid'    → wider region for grids / multi-column lists
 *  - number    → explicit max width
 *
 * On phones the max width IS the screen width, so this changes nothing there —
 * it only takes effect on tablets. Pass the same style to the amazen
 * `ScreenHeader` and the body, so the two columns line up.
 */
export function useScreenWidth(width: 'content' | 'grid' | number = 'content'): ViewStyle {
  const r = useResponsive();
  const maxWidth = typeof width === 'number' ? width : width === 'grid' ? r.gridMaxWidth : r.contentMaxWidth;
  return centeredContent(maxWidth);
}
