import { type ReactNode } from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';
import { useResponsive } from '../lib/responsive';

interface ScreenContainerProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Width cap:
   *  - 'content' → single readable column (forms, detail, prose)
   *  - 'grid'    → wider region for grids / multi-column lists
   *  - number    → explicit max width
   * Default 'content'.
   */
  width?: 'content' | 'grid' | number;
  /** Fill remaining vertical space (default true). Set false inside scroll content. */
  fill?: boolean;
}

/**
 * Constrains content to a comfortable max width and centers it. On phones
 * (isTablet === false) maxWidth === screen width, so this renders identically
 * to before — it only takes effect on tablets. Wrap a screen's body with this
 * to stop content stretching edge-to-edge on large screens.
 */
export function ScreenContainer({ children, style, width = 'content', fill = true }: ScreenContainerProps) {
  const r = useResponsive();
  const maxWidth =
    typeof width === 'number' ? width : width === 'grid' ? r.gridMaxWidth : r.contentMaxWidth;

  return (
    <View style={[{ width: '100%', maxWidth, alignSelf: 'center' }, fill ? { flex: 1 } : null, style]}>
      {children}
    </View>
  );
}

/**
 * Style helper for FlatList/ScrollView `contentContainerStyle` when the list
 * can't be wrapped in <ScreenContainer> (e.g. it owns the scroll). Centers and
 * caps the content column/grid. Spread AFTER your existing content style.
 */
export function centeredContent(maxWidth: number): ViewStyle {
  return { width: '100%', maxWidth, alignSelf: 'center' };
}
