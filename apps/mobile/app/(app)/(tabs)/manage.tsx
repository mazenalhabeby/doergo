import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../../src/contexts/auth-context';
import { useTheme } from '../../../src/contexts/theme-context';
import {
  COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS, ROUTES,
} from '../../../src/lib/constants';

const SERVICES = [
  { icon: 'calendar', label: 'Time Off', desc: 'Approve requests', route: '/(app)/manage/time-off-requests', color: '#f59e0b' },
  { icon: 'people', label: 'Members', desc: 'Manage team', route: '/(app)/manage/members', color: '#8b5cf6' },
  { icon: 'person-add', label: 'Join Requests', desc: 'Review & approve', route: '/(app)/manage/join-requests', color: '#f97316' },
  { icon: 'mail', label: 'Invitations', desc: 'Create invite codes', route: '/(app)/manage/invitations', color: '#06b6d4' },
  { icon: 'time', label: 'Schedules', desc: 'Work schedules', route: '/(app)/manage/schedules', color: '#10b981' },
] as const;

export default function ManageScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.surface }]}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {SERVICES.map((item) => (
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
            <Text style={[s.label, { color: colors.textPrimary }]}>{item.label}</Text>
            <Text style={[s.desc, { color: colors.textMuted }]}>{item.desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
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
