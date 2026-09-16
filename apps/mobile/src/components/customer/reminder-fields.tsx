import { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  REMINDER_KINDS,
  REMINDER_KIND_KEYS,
  REMINDER_LEADS,
  REMINDER_REPEATS,
  reminderLeadKey,
  reminderRepeatKey,
} from '@hbcfield/shared/client';
import { PressableScale } from '../pressable-scale';
import { ChipRow } from '../chip-row';
import { DateField } from '../date-field';
import { TimePickerModal } from '../time-picker-modal';
import { ChoiceChip } from './client-fields';
import { useTheme } from '../../contexts/theme-context';
import type { ReminderDraft } from '../../lib/reminder-draft';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';

// Re-exported so a caller wiring the form does not have to know that the pure
// half lives elsewhere — it is there to be testable, not to be looked up twice.
export { EMPTY_REMINDER, reminderDueAt, type ReminderDraft } from '../../lib/reminder-draft';

/**
 * Everything a reminder can say, beyond "remind me tomorrow".
 *
 * ⚠️ Extracted rather than written inline in the composer for two reasons. The
 * obvious one is length — five labelled controls is most of a screen. The one
 * that matters is that the composer OWNS the draft on purpose (a keystroke there
 * must not walk the activity feed), so the form has to be a component that takes
 * a value and reports a change, not one that holds state of its own. The only
 * state here is which picker is open, which nothing outside cares about.
 *
 * Every option list comes from `crm/reminder.ts` in shared — the same lists the
 * web reads. A chip written here would be a second, quietly diverging answer to
 * "what may a reminder say".
 */

/** Somebody a reminder can be pointed at. */
export interface ReminderAssignee {
  id: string;
  label: string;
}

export const ReminderFields = memo(function ReminderFields({
  value,
  onChange,
  /**
   * Who may be named, already restricted to this client's managers by the
   * caller. "Everyone" is always offered on top of these and is the default.
   */
  assignees,
}: {
  value: ReminderDraft;
  onChange: (next: ReminderDraft) => void;
  assignees: ReminderAssignee[];
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const { t } = useTranslation();
  const [timeOpen, setTimeOpen] = useState(false);

  const set = <K extends keyof ReminderDraft>(key: K, v: ReminderDraft[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <View style={s.block}>
      {/* ---- Reason: why this reminder exists ---- */}
      <Label text={t('customers.record.reminderForm.reason')} />
      <View style={s.wrap}>
        {REMINDER_KINDS.map((k) => (
          <ChoiceChip
            key={k}
            label={t(REMINDER_KIND_KEYS[k])}
            selected={value.kind === k}
            onPress={() => set('kind', k)}
          />
        ))}
      </View>

      {/*
        ---- When: a day and an hour ----

        Two controls the app already owns, rather than a datetime picker it does
        not. Both are pure JavaScript, so this reaches a phone over the air;
        `@react-native-community/datetimepicker` is native and would have meant
        a store build before anybody could set a reminder for Tuesday at two.
      */}
      <Label text={t('customers.record.reminderForm.when')} />
      <View style={s.whenRow}>
        <View style={s.whenDate}>
          <DateField
            value={value.dayKey}
            onChange={(dayKey) => set('dayKey', dayKey)}
            // A reminder for a day that has already gone will never fire.
            minDate={new Date()}
            clearable
            placeholder={t('customers.record.reminderForm.pickDay')}
            title={t('customers.record.reminderForm.when')}
          />
        </View>
        <PressableScale
          onPress={() => setTimeOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('customers.record.reminderForm.time')}
          style={[s.timeBox, { borderColor: colors.border }]}
        >
          <Ionicons name="time-outline" size={16} color={COLORS.primary} />
          <Text style={s.timeText}>{value.time}</Text>
        </PressableScale>
      </View>

      {/*
        ---- Lead time ----

        Nine options in a scrolling row rather than a wrapping block: wrapped,
        they cost three rows of a phone screen for something most people leave
        at "At time".
      */}
      <Label text={t('customers.record.reminderForm.lead')} />
      <ChipRow fadeColor={colors.surfaceRaised} style={s.leadRow}>
        {REMINDER_LEADS.map((min) => (
          <ChoiceChip
            key={min}
            label={t(reminderLeadKey(min))}
            selected={value.lead === min}
            onPress={() => set('lead', min)}
          />
        ))}
      </ChipRow>

      {/* ---- Repeat ---- */}
      <Label text={t('customers.record.reminderForm.repeat')} />
      <View style={s.wrap}>
        {REMINDER_REPEATS.map((r) => (
          <ChoiceChip
            key={r}
            label={t(reminderRepeatKey(r))}
            selected={value.repeat === r}
            onPress={() => set('repeat', r)}
          />
        ))}
      </View>

      {/*
        ---- Who is told ----

        Only ever offered when there is a real choice. With no assignable
        manager the reminder still reaches every manager of the client, which is
        what "Everyone" means — a row of one chip saying so would be furniture.
      */}
      {assignees.length > 0 && (
        <>
          <Label text={t('customers.record.reminderForm.who')} />
          <View style={s.wrap}>
            <ChoiceChip
              label={t('customers.record.reminderForm.allManagers')}
              selected={!value.assigneeId}
              onPress={() => set('assigneeId', '')}
            />
            {assignees.map((a) => (
              <ChoiceChip
                key={a.id}
                label={a.label}
                selected={value.assigneeId === a.id}
                onPress={() => set('assigneeId', a.id)}
              />
            ))}
          </View>
        </>
      )}
      <Text style={s.hint}>
        {value.assigneeId
          ? t('customers.record.reminderForm.whoOne')
          : t('customers.record.reminderForm.whoAll')}
      </Text>

      <TimePickerModal
        visible={timeOpen}
        value={value.time}
        onSelect={(hhmm) => set('time', hhmm)}
        // Never cleared to nothing: a reminder fires at an instant, so "no
        // hour" would have to mean midnight, which is not what anybody picking
        // a day for a follow-up call means.
        onClear={() => set('time', '09:00')}
        onClose={() => setTimeOpen(false)}
        title={t('customers.record.reminderForm.time')}
      />
    </View>
  );
});

function Label({ text }: { text: string }) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  return <Text style={s.label}>{text}</Text>;
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    block: {
      marginTop: SPACING.md,
      backgroundColor: c.surfaceRaised,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
    },
    label: {
      fontSize: FONT_SIZE.xs,
      fontWeight: FONT_WEIGHT.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: SPACING.md,
    },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
    whenRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
    // The day takes the room it needs for "Sat, 20 Sept 2026"; the hour is four
    // characters and should never be as wide as the date beside it.
    whenDate: { flex: 1, minWidth: 0 },
    timeBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: 12,
    },
    timeText: { fontSize: FONT_SIZE.base, color: c.textPrimary, fontWeight: FONT_WEIGHT.medium },
    /*
      Bled to the block's edge so the scroll fades sit on the boundary rather
      than floating inside the padding, where they read as a stray line.
      `ChipRow` re-applies the same `SPACING.md` inside, so the chips still line
      up with the labels above them.
    */
    leadRow: { marginHorizontal: -SPACING.md, marginTop: SPACING.xs },
    hint: { fontSize: FONT_SIZE.xs, color: c.textMuted, marginTop: SPACING.md, lineHeight: 16 },
  });
