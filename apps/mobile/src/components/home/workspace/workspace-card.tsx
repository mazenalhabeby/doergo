import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE } from '../../../lib/constants';
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
  peopleGap,
}: {
  label: string;
  people: PersonNodeData[];
  onPersonPress?: (userId: string) => void;
  color: string;
  peopleGap?: { gap: number; rowGap: number };
}) {
  if (people.length === 0) return null;
  return (
    <View style={styles.subGroup}>
      <Text style={[styles.subLabel, { color }]}>{label}</Text>
      <View style={[styles.people, peopleGap]}>
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
  // In the half-width (compact) card, keep the gap tight so two 60px person
  // tiles still fit two-per-row on a 360px-wide phone. Applied to the present
  // group AND every sub-group so they stay consistent.
  /*
    Equal both ways, at two densities.

    This overrides `styles.people`, so it is the gap that actually renders —
    fixing the stylesheet alone changed nothing. It was 14 across and 12 down,
    which makes a wrapped grid of faces read as two loose rows rather than one
    group.
  */
  const peopleGap = compact
    ? { gap: SPACING.sm, rowGap: SPACING.sm }
    : { gap: SPACING.md, rowGap: SPACING.md };
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
          <SubGroup label={t('components.workspaceCard.inField')} people={box.onRoadPeople || []} onPersonPress={onPersonPress} color="#60a5fa" peopleGap={peopleGap} />
          <SubGroup label={t('components.workspaceCard.offSite')} people={box.remotePeople || []} onPersonPress={onPersonPress} color={colors.textMuted} peopleGap={peopleGap} />
          <SubGroup label={t('components.workspaceCard.offShift', 'Off-shift')} people={box.offShiftPeople || []} onPersonPress={onPersonPress} color={colors.textMuted} peopleGap={peopleGap} />
          <SubGroup label={t('components.workspaceCard.offDuty')} people={box.offDutyPeople || []} onPersonPress={onPersonPress} color={colors.textMuted} peopleGap={peopleGap} />
        </View>
      ) : (
        <View style={styles.emptyBody}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t('components.workspaceCard.noneAssigned')}</Text>
        </View>
      )}

      {/* Actions (fixed locations only) — each one shown only if it was given a
          handler: the caller withholds it from somebody the server would refuse. */}
      {isFixed && (onAssign || onViewTasks) && (
        <View style={[styles.actions, { borderTopColor: colors.border }]}>
          {onAssign && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => onAssign(box.locationId)} activeOpacity={0.7}>
            <Ionicons name="person-add-outline" size={15} color={COLORS.primary} />
            <Text
              style={[styles.actionText, { color: COLORS.primary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t('components.workspaceCard.assign')}
            </Text>
          </TouchableOpacity>
          )}
          {onAssign && onViewTasks && (
            <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
          )}
          {onViewTasks && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => onViewTasks(box.locationId)} activeOpacity={0.7}>
            <Ionicons name="list-outline" size={15} color={colors.textSecondary} />
            <Text
              style={[styles.actionText, { color: colors.textSecondary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t('components.workspaceCard.tasks')}
            </Text>
          </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});

/*
  One grid, one inset.

  The header was inset 13px and the body 14px, so the title and the content
  under it started at different x positions — a pixel apart is invisible as a
  number and reads, correctly, as "nothing lines up". The rest was the same
  story in larger steps: 11, 13, 14 and 18 belong to no scale, so the gaps had
  no rhythm to be read as deliberate.

  Everything below is on the 4px scale the rest of the app uses. Micro values
  inside the alert badge stay as they are: a 9px-font pill is not "spacing
  between elements", and rounding its 2px inner padding would only make it fat.
*/
const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: SPACING.md, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    // Same inset as body and emptyBody — this is the card's left edge.
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  titleCol: { flex: 1 },
  title: { fontSize: FONT_SIZE.base, fontWeight: '700', letterSpacing: 0.1, lineHeight: 18 },
  subtitle: { fontSize: FONT_SIZE.xs, fontWeight: '500', marginTop: 2 },
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
  body: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.md },
  // Equal gap both ways: a grid of faces with wider columns than rows reads as
  // two unrelated rows rather than one group.
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, rowGap: SPACING.md },
  subGroup: { marginTop: SPACING.md },
  subLabel: {
    fontSize: 9, fontWeight: '700', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: SPACING.sm,
  },
  emptyBody: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.lg, alignItems: 'center' },
  emptyText: { fontSize: FONT_SIZE.sm },
  actions: { flexDirection: 'row', borderTopWidth: 1 },
  actionBtn: {
    flex: 1,
    minWidth: 0,
    // 44px is the smallest target every platform asks for; this row was 39.
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  actionText: { fontSize: FONT_SIZE.sm, fontWeight: '600', flexShrink: 1 },
  actionDivider: { width: 1 },
});
