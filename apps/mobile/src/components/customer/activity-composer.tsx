import { memo, useCallback, useMemo, useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '../pressable-scale';
import { RecordCard } from './record-card';
import { ChoiceChip } from './client-fields';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';

/** The three things a member records from the field. Call is mobile-only and stays. */
const KINDS = [
  { type: 'NOTE', key: 'customers.record.composer.note' },
  { type: 'CALL', key: 'customers.record.composer.call' },
  { type: 'REMINDER', key: 'customers.record.composer.reminder' },
] as const;

const DUE = [
  { k: 'today', h: 8, key: 'customers.record.due.today' },
  { k: 'tomorrow', h: 32, key: 'customers.record.due.tomorrow' },
  { k: 'week', h: 24 * 7, key: 'customers.record.due.week' },
] as const;

/**
 * What the composer hands back.
 *
 * ⚠️ A type ALIAS, not an interface. The outbox takes a body it can serialise
 * (`Record<string, unknown>`), and TypeScript gives an implicit index signature
 * to an object type alias and refuses one to an interface — so an interface
 * here fails to compile at the `queued.run` call for no reason a reader would
 * guess from the error.
 */
export type ComposedActivity = {
  type: string;
  body?: string;
  dueAt?: string;
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
 * nothing else.
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
}: {
  onSubmit: (input: ComposedActivity) => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const { t } = useTranslation();

  const [type, setType] = useState<string>('NOTE');
  const [body, setBody] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A reminder is worth filing with no words — "ring them back" is the due date
  // itself. Everything else needs something written down or it says nothing.
  const empty = !body.trim() && type !== 'REMINDER';

  const submit = useCallback(async () => {
    if (empty || saving) return;
    setSaving(true);
    try {
      let dueAt: string | undefined;
      if (type === 'REMINDER' && due) {
        const opt = DUE.find((d) => d.k === due);
        if (opt) dueAt = new Date(Date.now() + opt.h * 3600_000).toISOString();
      }
      const taken = await onSubmit({ type, body: body.trim() || undefined, dueAt });
      if (taken) {
        setBody('');
        setDue(null);
      }
    } finally {
      setSaving(false);
    }
  }, [body, due, empty, onSubmit, saving, type]);

  return (
    <RecordCard title={t('customers.record.logSomething')} icon="create-outline">
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
          type === 'REMINDER'
            ? 'customers.record.composer.reminderPlaceholder'
            : 'customers.record.composer.notePlaceholder',
        )}
        placeholderTextColor={colors.textMuted}
        style={s.input}
        accessibilityLabel={t('customers.record.logSomething')}
      />
      {type === 'REMINDER' && (
        <View style={s.chipsWrap}>
          {DUE.map((d) => (
            <ChoiceChip key={d.k} label={t(d.key)} selected={due === d.k} onPress={() => setDue(d.k)} />
          ))}
        </View>
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
