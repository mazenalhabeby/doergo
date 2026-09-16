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
import { RecordCard } from './record-card';
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

/**
 * The two things a member WRITES here.
 *
 * ⚠️ "Call" was a third chip and has been removed — from the AUTHORING side
 * only. `type: 'CALL'` is a call that HAPPENED; `reminderKind: 'CALL'`, three
 * rows further down inside the reminder options, is a call that has NOT
 * happened yet. Same word, opposite direction in time, one screen — and it was
 * reported as confusing twice. The web composer has been Note | Reminder for
 * exactly this reason, with "Call" living there only as a reminder's reason.
 *
 * ⚠️ Existing CALL rows still RENDER, keep their icon and keep the "Calls"
 * filter chip on the Activity tab. There is historic data, and both the server
 * and the web still produce them; what went is the button that makes new ones.
 */
const KINDS = [
  { type: 'NOTE', key: 'customers.record.composer.note' },
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
 * The composer, and the DRAFT it is holding.
 *
 * It carries no heading of its own — see the card below for why — so what a
 * member reads first is the choice between a note and a reminder, which is
 * also the first thing they have to decide.
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
    Two separate questions, and they were one state until a member asked why
    "Tomorrow" had no reason and no repeat.

    `showOptions` — is the full set on screen.
    `exact`       — does WHEN come from a picked day instead of a preset.

    Folding them together meant the options could only be reached by abandoning
    the presets, so choosing the fast path silently cost you the reason, the
    lead time and the repeat. They are unrelated: "remind me tomorrow, to call,
    every week" is an ordinary thing to want.

    ⚠️ Revealed in place rather than in a sheet. The note being typed and the
    reminder's own fields are one thought — "ring them on Tuesday about the
    quote" — and a sheet would cover the text the member is writing it against,
    then take the keyboard down on the way in and back up on the way out.
  */
  const [showOptions, setShowOptions] = useState(false);
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
    /*
      ⚠️ NO HEADING. It read "Log something" under a filled square icon, above a
      text box, on the Activity tab of a client record — it stated where the
      member already was, and the icon was chrome the card itself already
      provides. The chips are the first thing in the card now, which is also the
      first DECISION: what is being written.
    */
    <RecordCard>
      <View style={s.typeRow}>
        {KINDS.map((c) => (
          <ChoiceChip key={c.type} label={t(c.key)} selected={type === c.type} onPress={() => setType(c.type)} />
        ))}
        {/*
          Raising a job sits with the two kinds because it is the third thing a
          member does from here — but it is NOT a third chip, and the difference
          is the point. A chip changes what the box below produces; this leaves
          the screen for the task form. Drawn as an action for the same reason
          "Pick a time…" is: it opens something rather than being one of the
          answers, and looking like a chip would make it read as one.
        */}
        {!!onCreateTask && (
          <ActionChip icon="checkbox-outline" label={t('customers.record.newTask')} onPress={onCreateTask} />
        )}
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
        /*
          The removed heading was also the field's accessible name, so it is
          replaced rather than dropped — a screen reader would otherwise reach an
          unlabelled multiline box. The SELECTED KIND is the honest answer to
          "what is this field": it is a note, or it is a reminder, and it changes
          when the chips do.
        */
        accessibilityLabel={t(
          isReminder ? 'customers.record.composer.reminder' : 'customers.record.composer.note',
        )}
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
                onPress={() => {
                  setPreset(p.key);
                  // Back to the preset for WHEN, and drop the picked day so the
                  // two cannot both look chosen. The options stay open.
                  setExact(false);
                  setReminder((r) => ({ ...r, dueAt: null }));
                }}
              />
            ))}
            {/*
              Opens the rest of the reminder — reason, lead time, repeat, and a
              day of its own. It no longer cancels the preset: a member can tap
              "Tomorrow" and still say what it is for.
            */}
            <ActionChip
              icon="options-outline"
              label={t('customers.record.reminderForm.moreOptions')}
              onPress={() => setShowOptions((v) => !v)}
              active={showOptions}
              expanded={showOptions}
            />
          </View>
          {showOptions && (
            <ReminderFields
              value={reminder}
              onChange={(next) => {
                setReminder(next);
                // Naming a day is what moves WHEN off the preset — opening the
                // options to set a repeat must not silently clear "Tomorrow".
                if (reminderDueAt(next)) setExact(true);
              }}
              assignees={assignees}
            />
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

/**
 * A control that sits in a chip row and is NOT one of the answers.
 *
 * ⚠️ Deliberately not a `ChoiceChip`: a chip is a value the row is currently
 * set to, and this OPENS something — the exact-time fields, or the task form on
 * another screen. Drawn with a dashed outline so the difference is visible
 * before it is tapped; looking like one more chip is how "Pick a time…" would
 * read as a fourth preset and "Task" as a third kind of note.
 *
 * Written once because there are two of them, and two copies of a control whose
 * whole job is to look unlike its neighbours is how one of them ends up looking
 * exactly like them.
 */
function ActionChip({
  icon,
  label,
  onPress,
  /** Drawn in the brand colour while what it opened is showing. */
  active,
  /** Set only on a control that reveals something in place — not on a link out. */
  expanded,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  expanded?: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const tint = active ? COLORS.primary : colors.textMuted;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      accessibilityLabel={label}
      style={[s.action, { borderColor: active ? COLORS.primary : colors.border }]}
    >
      <Ionicons name={icon} size={14} color={tint} />
      <Text style={[s.actionText, { color: tint }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
    // The first row in the card, so it brings no top margin of its own — the
    // headerless card already insets it. Wraps rather than reserving a spacer:
    // "Note", "Reminder" and "Task" translate long, and a fixed row would push
    // the third one off a narrow screen with nothing to catch it.
    typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
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
    // `ActionChip`'s outline — see its own note for why it is dashed.
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    actionText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
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
