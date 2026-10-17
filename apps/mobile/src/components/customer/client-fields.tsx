import { memo } from 'react';
import { View, type KeyboardTypeOptions } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { FilterPill, PrimaryButton as AmazenPrimary, JobField, SectionLabel } from '../amazen';

/*
  The client forms' four parts — a labelled field, a choice, a group title and
  the save button — drawn in the app's own language.

  They were written in the old palette and are shared by every client form (the
  edit sheet, adding a contact person, the reminder fields, the card reader's
  review), so redrawing them HERE is what moves all of those at once, and what
  keeps them from drifting apart again.
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
  const { amazen } = useTheme();
  return (
    <View style={{ gap: amazen.space(1.5), marginTop: amazen.space(3) }}>
      <SectionLabel>{label}</SectionLabel>
      <JobField
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize === 'none' ? false : undefined}
        multiline={multiline}
        editable={editable}
        style={!editable ? { opacity: 0.6 } : undefined}
        accessibilityLabel={label}
      />
    </View>
  );
});

/** One answer among several — the same pill as every filter row in the app. */
export const ChoiceChip = memo(function ChoiceChip({
  label,
  selected,
  onPress,
  dotColor,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  dotColor?: string;
  disabled?: boolean;
}) {
  return <FilterPill label={label} on={selected} onPress={onPress} dot={dotColor} disabled={disabled} />;
});

export function FieldGroupTitle({ children }: { children: string }) {
  const { amazen } = useTheme();
  return <SectionLabel style={{ marginTop: amazen.space(5) }}>{children}</SectionLabel>;
}

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
  const { amazen } = useTheme();
  return <AmazenPrimary label={label} onPress={onPress} disabled={disabled} loading={busy} style={{ marginTop: amazen.space(5) }} />;
}
