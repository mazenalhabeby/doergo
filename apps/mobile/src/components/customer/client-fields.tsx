import { memo, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, type KeyboardTypeOptions } from 'react-native';
import { PressableScale } from '../pressable-scale';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';

/**
 * The form furniture both client sheets are built from.
 *
 * The edit sheet and the add-a-contact sheet want the same labelled input and
 * the same row of choices, and the record screen wants the same choice chip for
 * stage and for language. Written per sheet they drift in the two ways that
 * always show: the label sits at a different size, and one of them forgets
 * `autoCapitalize="none"` on the email and quietly sends "Anna@Siemens.At".
 */
export const LabelledField = memo(function LabelledField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'sentences',
  multiline,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  editable?: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize === 'none' ? false : undefined}
        multiline={multiline}
        editable={editable}
        style={[s.input, multiline && s.inputMultiline, !editable && { opacity: 0.6 }]}
        accessibilityLabel={label}
      />
    </View>
  );
});

/**
 * One choice among several — stage, language, workspace, Company/Person.
 *
 * ⚠️ `accessibilityState.selected` is not decoration: a chip row is four
 * identical-sounding buttons to a screen reader without it, with no way to
 * tell which one is currently the answer.
 */
export const ChoiceChip = memo(function ChoiceChip({
  label,
  selected,
  onPress,
  /** A dot before the label — the stage colours. Single colour, no icon. */
  dotColor,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  dotColor?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      style={[
        s.chip,
        {
          borderColor: selected ? COLORS.primary : colors.border,
          backgroundColor: selected ? colors.primaryLight : 'transparent',
        },
        disabled && { opacity: 0.5 },
      ]}
    >
      {!!dotColor && <View style={[s.dot, { backgroundColor: dotColor }]} />}
      <Text style={[s.chipText, { color: selected ? COLORS.primary : colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
});

/** A heading inside a sheet — "Company details", "Contact". */
export function FieldGroupTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  return <Text style={s.groupTitle}>{children}</Text>;
}

/** The sheet's one commit button. */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={[s.primary, (disabled || busy) && { opacity: 0.5 }]}
    >
      <Text style={s.primaryText}>{label}</Text>
    </PressableScale>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    field: { marginTop: SPACING.md },
    label: {
      fontSize: FONT_SIZE.sm,
      color: c.textMuted,
      fontWeight: FONT_WEIGHT.medium,
      marginBottom: SPACING.xs,
    },
    input: {
      backgroundColor: c.input,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.inputBorder,
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      fontSize: FONT_SIZE.xl,
      color: c.textPrimary,
    },
    // `minHeight`, not `height`: the box grows with the note rather than
    // scrolling three lines of it inside a fixed frame.
    inputMultiline: { minHeight: 84, textAlignVertical: 'top' },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      borderWidth: 1,
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    dot: { width: 7, height: 7, borderRadius: 4 },
    chipText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
    groupTitle: {
      fontSize: FONT_SIZE.sm,
      fontWeight: FONT_WEIGHT.bold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: SPACING.xl,
    },
    primary: {
      backgroundColor: COLORS.primary,
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.lg,
      alignItems: 'center',
      marginTop: SPACING.xl,
    },
    primaryText: { color: COLORS.white, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.semibold },
  });
