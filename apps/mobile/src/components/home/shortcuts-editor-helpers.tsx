import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../amazen';
import { type ShortcutGroup } from '../../home/shortcuts';

/** ShortcutsEditor's module-level helpers, moved here unchanged so its sections can read them too. */
/** A count, never a dot — and capped at 9+ (spec §4). */
export function Badge({ n, ring, style }: { n: number; ring: string; style?: StyleProp<ViewStyle> }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={[{ position: 'absolute', top: 6, right: 6, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: c.warn, borderWidth: 2, borderColor: ring, alignItems: 'center', justifyContent: 'center' }, style]}>
      <AText variant="caption" numeric style={{ fontSize: 10, lineHeight: 12, color: c.warnInk }}>{n > 9 ? '9+' : String(n)}</AText>
    </View>
  );
}

export const GROUPS: ShortcutGroup[] = ['waiting', 'do', 'go', 'manage'];
