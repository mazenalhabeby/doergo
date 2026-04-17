import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../contexts/theme-context';
import { SPACING } from '../lib/constants';

export function SheetHeader() {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.handle, { backgroundColor: isDark ? '#4b5563' : '#d1d5db' }]} />
      <TouchableOpacity
        style={[styles.closeBtn, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: SPACING.md,
  },
  closeBtn: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.lg,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
