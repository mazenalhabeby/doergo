import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import { ScreenContainer } from '../../../src/components';
import { manageRowsFor } from '../../../src/lib/manage-rows';
import {
  COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS, ROUTES,
} from '../../../src/lib/constants';

export default function ManageScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const rows = useMemo(() => manageRowsFor(user), [user]);

  return (
    <ScreenContainer width="content" style={{ backgroundColor: colors.surface }}>
    <ScrollView
      style={[s.container, { backgroundColor: colors.surface }]}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {rows.map((item) => (
        <TouchableOpacity
          key={item.route}
          style={[s.row, { backgroundColor: colors.card }]}
          onPress={() => router.push(item.route as any)}
          activeOpacity={0.6}
        >
          <View style={[s.iconBox, { backgroundColor: item.color + '15' }]}>
            <Ionicons name={item.icon as any} size={22} color={item.color} />
          </View>
          <View style={s.textCol}>
            <Text style={[s.label, { color: colors.textPrimary }]}>{t(item.labelKey)}</Text>
            <Text style={[s.desc, { color: colors.textMuted }]}>{t(item.descKey)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    ...SHADOWS.sm,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.lg,
  },
  textCol: { flex: 1 },
  label: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  desc: { fontSize: FONT_SIZE.sm, marginTop: 2 },
});
