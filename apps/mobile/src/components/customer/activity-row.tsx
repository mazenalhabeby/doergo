import { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../pressable-scale';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';
import type { MobileCustomerActivity } from '../../lib/api';

/*
  ⚠️ A REMINDER always takes the alarm, whatever its reason is.

  Drawing a reminder-to-call with the telephone icon would give it the same
  glyph as a call that HAPPENED — the one confusion this whole feature exists to
  prevent (see `crm/reminder.ts` in shared). The reason is said in words, on the
  heading, where it cannot be mistaken for a record of the past.
*/
const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  NOTE: 'document-text',
  CALL: 'call',
  EMAIL: 'mail',
  MEETING: 'people',
  REMINDER: 'alarm',
  STATUS: 'sync',
  SYSTEM: 'settings',
};

/** An activity the outbox is still holding — see `useQueuedCreate`. */
export type PendingActivity = MobileCustomerActivity & { pendingSync?: boolean };

/** A small fact about an entry — its lead time, its recurrence. Already localised. */
export interface ActivityTag {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

/**
 * One entry on the client's timeline.
 *
 * ⚠️ A timeline entry is drawn as a RAIL, not as a card. Thirty bordered boxes
 * stacked down a phone read as thirty unrelated things; a single line with a
 * dot per entry reads as one history, which is what it is. It also halves the
 * vertical space each entry costs, and a client of any age has a lot of them.
 *
 * Memoised on its own props: the composer's text input lives on the same
 * screen and takes a keystroke per character, and without this every entry
 * re-renders on each one.
 */
export const ActivityRow = memo(function ActivityRow({
  activity,
  /** Already localised by the caller — this component writes no words. */
  heading,
  meta,
  /** Absent for a queued entry: there is nothing on the server to mark done. */
  onToggleDone,
  doneLabel,
  /**
   * How it fires — "1 hour before", "Weekly". Localised by the caller, and
   * empty for anything that is not a reminder saying something unusual.
   */
  tags,
  /** Draws the connecting line downward. False on the last entry. */
  continues,
}: {
  activity: PendingActivity;
  heading: string;
  meta: string;
  onToggleDone?: (a: MobileCustomerActivity) => void;
  doneLabel?: string;
  tags?: ActivityTag[];
  continues: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);

  const overdue =
    activity.type === 'REMINDER' &&
    !!activity.dueAt &&
    !activity.doneAt &&
    new Date(activity.dueAt).getTime() < Date.now();
  const done = !!activity.doneAt;
  // A reminder speaks in three states and each wants its own colour; every
  // other kind of entry is simply history and takes the brand green.
  const tone = done ? COLORS.success : overdue ? COLORS.error : activity.type === 'REMINDER' ? COLORS.amber : COLORS.primary;

  return (
    <View style={s.row}>
      <View style={s.rail}>
        <View style={[s.bullet, { backgroundColor: colors.card, borderColor: tone }]}>
          <Ionicons name={ICON[activity.type] ?? 'ellipse'} size={12} color={tone} />
        </View>
        {continues && <View style={s.line} />}
      </View>

      <View style={s.body}>
        <Text style={s.meta} numberOfLines={2}>
          <Text style={s.heading}>{heading}</Text>
          {meta ? ` · ${meta}` : ''}
        </Text>
        {!!activity.body && <Text style={s.text}>{activity.body}</Text>}

        {!!tags?.length && (
          <View style={s.tags}>
            {tags.map((tag) => (
              <View key={tag.label} style={s.tag}>
                <Ionicons name={tag.icon} size={11} color={colors.textMuted} />
                <Text style={s.tagText}>{tag.label}</Text>
              </View>
            ))}
          </View>
        )}

        {activity.type === 'REMINDER' && onToggleDone && doneLabel && (
          <PressableScale
            onPress={() => onToggleDone(activity)}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={doneLabel}
            style={s.check}
          >
            <Ionicons name={done ? 'checkbox' : 'square-outline'} size={16} color={tone} />
            <Text style={[s.checkText, { color: tone }]}>{doneLabel}</Text>
          </PressableScale>
        )}
      </View>
    </View>
  );
});

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: SPACING.md },
    rail: { alignItems: 'center', width: 24 },
    bullet: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // `flex: 1` inside a row whose height is the body's: the line reaches the
    // next bullet whatever the entry's length, with no measurement.
    line: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: 2 },
    body: { flex: 1, minWidth: 0, paddingBottom: SPACING.lg },
    meta: { fontSize: FONT_SIZE.sm, color: c.textMuted, lineHeight: 18 },
    heading: { fontWeight: FONT_WEIGHT.semibold, color: c.textSecondary },
    text: { fontSize: FONT_SIZE.lg, color: c.textPrimary, marginTop: 3, lineHeight: 20 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.xs },
    tag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    tagText: { fontSize: FONT_SIZE.xs, color: c.textMuted },
    check: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.sm },
    checkText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  });
