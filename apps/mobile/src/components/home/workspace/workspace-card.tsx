import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { COLORS } from '../../../lib/constants';
import { PersonNode, type PersonNodeData } from './person-node';

export interface WorkspaceBoxData {
  locationId: string;
  title: string;
  type: 'fixed' | 'dynamic';
  people: PersonNodeData[];
  onRoadPeople?: PersonNodeData[];
  remotePeople?: PersonNodeData[];
  offShiftPeople?: PersonNodeData[];
  offDutyPeople?: PersonNodeData[];
  totalAssigned?: number;
  activeCount?: number;
  alerts?: number;
}

interface Props {
  box: WorkspaceBoxData;
  /** Width/layout override from the dynamic grid. */
  style?: StyleProp<ViewStyle>;
  /** Half-width card — tighten spacing so content fits. */
  compact?: boolean;
  onPersonPress?: (userId: string) => void;
  onAssign?: (locationId: string) => void;
  onViewTasks?: (locationId: string) => void;
}

function SubGroup({
  label,
  people,
  onPersonPress,
  color,
}: {
  label: string;
  people: PersonNodeData[];
  onPersonPress?: (userId: string) => void;
  color: string;
}) {
  if (people.length === 0) return null;
  return (
    <View style={styles.subGroup}>
      <Text style={[styles.subLabel, { color }]}>{label}</Text>
      <View style={styles.people}>
        {people.map((p) => (
          <PersonNode key={p.userId} person={p} onPress={onPersonPress} />
        ))}
      </View>
    </View>
  );
}

export const WorkspaceCard = React.memo(function WorkspaceCard({
  box,
  style,
  compact = false,
  onPersonPress,
  onAssign,
  onViewTasks,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isFixed = box.type === 'fixed';
  const present = box.people;
  const peopleGap = compact ? { gap: 10, rowGap: 12 } : { gap: 14, rowGap: 12 };
  const hasAnyone =
    present.length +
      (box.onRoadPeople?.length || 0) +
      (box.remotePeople?.length || 0) +
      (box.offShiftPeople?.length || 0) +
      (box.offDutyPeople?.length || 0) >
    0;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {box.title}
          </Text>
          {isFixed && (
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {t('components.workspaceCard.activeCount', {
                active: box.activeCount ?? present.length,
                total: box.totalAssigned ?? present.length,
              })}
            </Text>
          )}
        </View>
        {!!box.alerts && box.alerts > 0 && (
          <View style={styles.alertBadge}>
            <Ionicons name="warning" size={9} color="#f87171" />
            <Text style={styles.alertText}>{box.alerts}</Text>
          </View>
        )}
      </View>

      {/* People */}
      {hasAnyone ? (
        <View style={styles.body}>
          {present.length > 0 && (
            <View style={[styles.people, peopleGap]}>
              {present.map((p) => (
                <PersonNode key={p.userId} person={p} onPress={onPersonPress} />
              ))}
            </View>
          )}
          <SubGroup label={t('components.workspaceCard.inField')} people={box.onRoadPeople || []} onPersonPress={onPersonPress} color="#60a5fa" />
          <SubGroup label={t('components.workspaceCard.offSite')} people={box.remotePeople || []} onPersonPress={onPersonPress} color={colors.textMuted} />
          <SubGroup label={t('components.workspaceCard.offShift', 'Off-shift')} people={box.offShiftPeople || []} onPersonPress={onPersonPress} color={colors.textMuted} />
          <SubGroup label={t('components.workspaceCard.offDuty')} people={box.offDutyPeople || []} onPersonPress={onPersonPress} color={colors.textMuted} />
        </View>
      ) : (
        <View style={styles.emptyBody}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t('components.workspaceCard.noneAssigned')}</Text>
        </View>
      )}

      {/* Actions (fixed locations only) */}
      {isFixed && (
        <View style={[styles.actions, { borderTopColor: colors.border }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onAssign?.(box.locationId)} activeOpacity={0.7}>
            <Ionicons name="person-add-outline" size={15} color={COLORS.primary} />
            <Text style={[styles.actionText, { color: COLORS.primary }]}>{t('components.workspaceCard.assign')}</Text>
          </TouchableOpacity>
          <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={styles.actionBtn} onPress={() => onViewTasks?.(box.locationId)} activeOpacity={0.7}>
            <Ionicons name="list-outline" size={15} color={colors.textSecondary} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>{t('components.workspaceCard.tasks')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 13,
    paddingTop: 12,
    paddingBottom: 8,
  },
  titleCol: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', letterSpacing: 0.1, lineHeight: 18 },
  subtitle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginTop: 1,
  },
  alertText: { fontSize: 9, fontWeight: '700', color: '#f87171' },
  body: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12 },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, rowGap: 12 },
  subGroup: { marginTop: 12 },
  subLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  emptyBody: { paddingHorizontal: 14, paddingVertical: 18, alignItems: 'center' },
  emptyText: { fontSize: 12 },
  actions: { flexDirection: 'row', borderTopWidth: 1 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
  },
  actionText: { fontSize: 12, fontWeight: '600' },
  actionDivider: { width: 1 },
});
