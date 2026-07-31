import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/theme-context';
import { SPACING, RADIUS, FONT_SIZE } from '../../lib/constants';
import { portalColor, portalTint, portalIcon } from '../../lib/portal-ui';

/** Status → semantic base colour (reads well on translucent tint in both themes). */
export function statusColor(status: string): string {
  const s = (status || '').toUpperCase();
  if (/COMPLET|CLOSED|RESOLV|DONE/.test(s)) return '#16A34A';
  if (/CANCEL/.test(s)) return '#64748B';
  if (/BLOCK|FAIL|REJECT/.test(s)) return '#DC2626';
  if (/PROGRESS|EN_ROUTE|ARRIV|START/.test(s)) return '#D97706';
  if (/ACCEPT/.test(s)) return '#4F46E5';
  if (/ASSIGN/.test(s)) return '#7C3AED';
  return '#2563EB'; // NEW / default
}

export function StatusPill({ status }: { status: string }) {
  const base = statusColor(status);
  return (
    <View style={[pill.wrap, { backgroundColor: base + '1A' }]}>
      <View style={[pill.dot, { backgroundColor: base }]} />
      <Text style={[pill.text, { color: base }]}>{status.replace(/_/g, ' ').toLowerCase()}</Text>
    </View>
  );
}

export function RequestRow({
  title,
  reference,
  status,
  icon,
  color,
  onPress,
}: {
  title: string;
  reference: string;
  status: string;
  icon?: string | null;
  color?: string | null;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [row.card, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <View style={[row.thumb, { backgroundColor: portalTint(color) }]}>
        <MaterialCommunityIcons name={portalIcon(icon)} size={20} color={portalColor(color)} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[row.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[row.sub, { color: colors.textMuted }]}>{reference}</Text>
      </View>
      <StatusPill status={status} />
    </Pressable>
  );
}

const pill = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: 'Outfit_400Regular', fontSize: 11, textTransform: 'capitalize' },
});

const row = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.md },
  thumb: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.base, fontWeight: '600' },
  sub: { fontFamily: 'Outfit_400Regular', fontSize: FONT_SIZE.sm, marginTop: 2 },
});
