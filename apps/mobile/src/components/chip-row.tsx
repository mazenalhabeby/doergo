import {
  StyleSheet
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/theme-context';
import { SPACING } from '../lib/constants';
const s = StyleSheet.create({
  wrap: { position: 'relative' },
  scroller: { flexGrow: 0, flexShrink: 0 },
  content: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
    alignItems: 'center',
  },
  fade: { position: 'absolute', top: 0, bottom: 0, width: 32 },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
});
