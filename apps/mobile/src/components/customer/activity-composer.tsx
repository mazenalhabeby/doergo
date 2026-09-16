import { memo, useCallback, useMemo, useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  REMINDER_PRESETS,
  reminderPresetKey,
  reminderPresetDue,
  reminderPayload,
  type ReminderPresetKey,
} from '@hbcfield/shared/client';
import { PressableScale } from '../pressable-scale';
import { RecordCard, CardAction } from './record-card';
import { ChoiceChip } from './client-fields';
import {
  ReminderFields,
  EMPTY_REMINDER,
  reminderDueAt,
  type ReminderDraft,
  type ReminderAssignee,
} from './reminder-fields';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';

/** The three things a member records from the field. Call is mobile-only and stays. */
const KINDS = [
  { type: 'NOTE', key: 'customers.record.composer.note' },
  { type: 'CALL', key: 'customers.record.composer.call' },
  { type: 'REMINDER', key: 'customers.record.composer.reminder' },
] as const;

/**
 * What the composer hands back.
 *
 * ⚠️ A type ALIAS, not an interface. The outbox takes a body it can serialise
 * (`Record<string, unknown>`), and TypeScript gives an implicit index signature
 * to an object type alias and refuses one to an interface — so an interface
 * here fails to compile at the `queued.run` call for no reason a reader would
 * guess from the error.
 *
 * ⚠️ The four reminder fields are present ONLY on a reminder. A note that
 * carried `reminderKind` would be sending a field its author cannot set; the
 * server nulls them for a non-reminder anyway, and a client that relies on that
 * is a client that stops being right the day the server stops bothering.
 */
export type ComposedActivity = {
  type: string;
  body?: string;
  dueAt?: string;
  reminderKind?: string;
  remindBeforeMin?: number;
  reminderAssigneeId?: string | null;
  repeat?: string;
};

/**
 * "Log something" — the composer, and the DRAFT it is holding.
 *
 * ⚠️ The draft lives HERE, not on the record screen, and that is a performance
 * decision rather than a tidiness one. The composer sits in the Activity tab's
 * `ListHeaderComponent`; with the text on the screen's state every keystroke
 * would re-render the screen, and with it the `FlatList` and its `renderItem`.
 * `ActivityRow` is memoised, so that would not redraw two hundred rows — but it
 * would walk them, on every character, while somebody types a note with one
 * thumb. Keeping the draft inside means a keystroke re-renders this card and
 * nothing else. The reminder options obey the same rule: `ReminderFields` takes
 * a value and reports a change, and holds nothing the screen would need.
 *
 * ⚠️ It is also why this is a module-scope component. A component defined
 * inside the screen's render is a NEW type on every pass, so React would
 * unmount and remount the header — the input would lose focus and the keyboard
 * would close after every letter. Same reason the screen passes an ELEMENT to
 * `ListHeaderComponent` and never a function.
 */
export const ActivityComposer = memo(function ActivityComposer({
  /** Resolves true when the entry was taken (sent, or queued): clear the draft. */
  onSubmit,
  /**
   * Raise a job for this client. Absent when the client is filed in no
   * workspace — a task has to belong to one, so there would be nowhere to put
   * it. Matches the web, which gates the same button on the same fact.
   */
  onCreateTask,
  /** This client's managers, already resolved to names by the screen. */
  assignees = [],
}: {
  onSubmit: (input: ComposedActivity) => Promise<boolean>;
  onCreateTask?: () => void;
  assignees?: ReminderAssignee[];
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const { t } = useTranslation();

  const [type, setType] = useState<string>('NOTE');
  const [body, setBody] = useState('');
  const [preset, setPreset] = useState<ReminderPresetKey | null>(null);
  /*
    The full set, and whether it is showing.

    ⚠️ Revealed in place rather than in a sheet. The note being typed and the
    reminder's own fields are one thought — "ring them on Tuesday about the
    quote" — and a sheet would cover the text the member is writing it against,
    then take the keyboard down on the way in and back up on the way out.
  */
  const [exact, setExact] = useState(false);
  const [reminder, setReminder] = useState<ReminderDraft>(EMPTY_REMINDER);
  const [saving, setSaving] = useState(false);

  const isReminder = type === 'REMINDER';

  /*
    When this reminder is for, whichever way it was said.

    The exact form wins when it is open AND has a day, so opening it to look and
    closing it again does not throw away the preset that was already chosen.
  */
  const dueAt = useMemo(() => {
    if (!isReminder) return undefined;
    const exactDue = exact ? reminderDueAt(reminder) : null;
    if (exactDue) return exactDue;
    return preset ? reminderPresetDue(preset).toISOString() : undefined;
  }, [isReminder, exact, reminder, preset]);

  // A reminder is worth filing with no words — "ring them back" is the due date
  // itself. Everything else needs something written down or it says nothing.
  const empty = !body.trim() && !isReminder;

  const submit = useCallback(async () => {
    if (empty || saving) return;
    setSaving(true);
    try {
      const base: ComposedActivity = { type, body: body.trim() || undefined };
      /*
        ⚠️ Built by `reminderPayload`, never by hand. It drops anything the
        server would not recognise and turns it into the default, so a phone
        cannot put `repeat: 'FORTNIGHTLY'` on a record where it would persist
        as text nothing will ever schedule.
      */
      const input: ComposedActivity = isReminder
        ? { ...base, ...reminderPayload({ dueAt, reminderKind: reminder.kind, remindBeforeMin: reminder.lead, repeat: reminder.repeat, reminderAssigneeId: reminder.assigneeId }) }
        : base;

      const taken = await onSubmit(input);
      if (taken) {
        setBody('');
        setPreset(null);
        setExact(false);
        setReminder(EMPTY_REMINDER);
      }
    } finally {
      setSaving(false);
    }
  }, [body, dueAt, empty, isReminder, onSubmit, reminder, saving, type]);

  return (
    <RecordCard
      title={t('customers.record.logSomething')}
      icon="create-outline"
      action={onCreateTask ? (
        <CardAction icon="checkbox-outline" label={t('customers.record.newTask')} onPress={onCreateTask} />
      ) : undefined}
    >
      <View style={s.chipsWrap}>
        {KINDS.map((c) => (
          <ChoiceChip key={c.type} label={t(c.key)} selected={type === c.type} onPress={() => setType(c.type)} />
        ))}
      </View>
      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        placeholder={t(
          isReminder
            ? 'customers.record.composer.reminderPlaceholder'
            : 'customers.record.composer.notePlaceholder',
        )}
        placeholderTextColor={colors.textMuted}
        style={s.input}
        accessibilityLabel={t('customers.record.logSomething')}
      />
      {isReminder && (
        <>
          {/*
            The presets stay the fast path.

            One tap standing at a customer's door is the common field case, and
            it is why they are not replaced by the picker. "Pick a time…" sits
            beside them rather than above: it is the exception, and it should
            read as the longer way round.
          */}
          <View style={s.chipsWrap}>
            {REMINDER_PRESETS.map((p) => (
              <ChoiceChip
                key={p.key}
                label={t(reminderPresetKey(p.key))}
                selected={!exact && preset === p.key}
                onPress={() => { setPreset(p.key); setExact(false); }}
              />
            ))}
            <PressableScale
              onPress={() => setExact((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: exact }}
              accessibilityLabel={t('customers.record.reminderForm.pickTime')}
              style={[s.more, { borderColor: exact ? COLORS.primary : colors.border }]}
            >
              <Ionicons name="options-outline" size={14} color={exact ? COLORS.primary : colors.textMuted} />
              <Text style={[s.moreText, { color: exact ? COLORS.primary : colors.textMuted }]}>
                {t('customers.record.reminderForm.pickTime')}
              </Text>
            </PressableScale>
          </View>
          {exact && (
            <ReminderFields value={reminder} onChange={setReminder} assignees={assignees} />
          )}
        </>
      )}
      <PressableScale
        onPress={() => void submit()}
        disabled={saving || empty}
        accessibilityRole="button"
        accessibilityLabel={t('customers.record.composer.add')}
        accessibilityState={{ busy: saving, disabled: saving || empty }}
        style={[s.add, (saving || empty) && { opacity: 0.45 }]}
      >
        <Text style={s.addText}>{t('customers.record.composer.add')}</Text>
      </PressableScale>
    </RecordCard>
  );
});

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
    input: {
      backgroundColor: c.input,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.inputBorder,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      marginTop: SPACING.md,
      minHeight: 72,
      textAlignVertical: 'top',
      fontSize: FONT_SIZE.lg,
      color: c.textPrimary,
    },
    // Deliberately NOT a ChoiceChip: it opens something rather than being one of
    // the answers, and looking like a fourth preset would make it read as one.
    more: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    moreText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
    add: {
      alignSelf: 'flex-end',
      marginTop: SPACING.md,
      backgroundColor: COLORS.primary,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.xxl,
      paddingVertical: SPACING.md,
    },
    addText: { color: COLORS.white, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.semibold },
  });
