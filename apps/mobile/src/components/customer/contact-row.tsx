import { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../pressable-scale';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';
import type { MobileCustomerContact } from '../../lib/api/customers';

/**
 * One end of a contact link, drawn the same whichever end you are standing on.
 *
 * ⚠️ ONE component, not two. "Who works at Siemens" and "which firms does Anna
 * contact for" are the SAME ROW (`CustomerContact`) asked from opposite sides —
 * `contacts(companyId)` fills `person`, `companies(personId)` fills `company`.
 * Two components would drift the moment one gained a primary star or a phone
 * button, and the panels would disagree about a single stored fact.
 *
 * So the row takes the link and is told which side to SHOW; everything else —
 * the role, the primary star, what may be done to it — is identical.
 */
export interface ContactRowProps {
  link: MobileCustomerContact;
  /**
   * Which end to render. 'person' for a company's staff list, 'company' for a
   * person's employers. The other end is the record you are already looking at.
   */
  side: 'person' | 'company';
  /** Opens the record for the end being shown. */
  onOpen: (customerId: string) => void;
  /**
   * Writes. Absent (not disabled) when the reader may not edit this client's
   * info — a control that exists only to be refused is worse than no control.
   */
  onTogglePrimary?: (link: MobileCustomerContact) => void;
  onRemove?: (link: MobileCustomerContact) => void;
  /** Screen-reader labels; the icons say nothing to one. */
  labels: { primary: string; makePrimary: string; remove: string; call: string; email: string };
  /** While this specific row has work in flight. */
  busy?: boolean;
}

function ContactRowBase({ link, side, onOpen, onTogglePrimary, onRemove, labels, busy }: ContactRowProps) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);

  const end = side === 'person' ? link.person : link.company;
  // A link whose far end did not come back is a row that can do nothing: no
  // name to show and no record to open. Rendering an empty card would be worse
  // than the gap, because it looks tappable.
  if (!end) return null;

  // Only the person end carries contact details — a company's own number lives
  // on its record, which this row is not.
  const person = side === 'person' ? link.person : null;
  const primary = link.isPrimary === true;

  return (
    <View style={[s.row, busy && { opacity: 0.5 }]}>
      <PressableScale
        onPress={() => onOpen(end.id)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={end.name}
        style={s.main}
      >
        <View style={s.nameLine}>
          <Text style={s.name} numberOfLines={1}>{end.name}</Text>
          {primary && (
            <Ionicons name="star" size={13} color={COLORS.amber} accessibilityLabel={labels.primary} />
          )}
        </View>
        {!!link.role && <Text style={s.role} numberOfLines={1}>{link.role}</Text>}
      </PressableScale>

      <View style={s.actions}>
        {!!person?.phone && (
          <RowIcon icon="call" label={labels.call} onPress={() => void Linking.openURL(`tel:${person.phone}`)} />
        )}
        {!!person?.email && (
          <RowIcon icon="mail" label={labels.email} onPress={() => void Linking.openURL(`mailto:${person.email}`)} />
        )}
        {onTogglePrimary && !primary && (
          <RowIcon icon="star-outline" label={labels.makePrimary} onPress={() => onTogglePrimary(link)} disabled={busy} />
        )}
        {onRemove && (
          <RowIcon icon="close" label={labels.remove} tone="danger" onPress={() => onRemove(link)} disabled={busy} />
        )}
      </View>
    </View>
  );
}

/**
 * A row is re-rendered only when its own link changes.
 *
 * A company with thirty staff re-renders thirty rows every time the composer's
 * text input takes a keystroke otherwise — the parent owns that state and this
 * list sits under it.
 */
export const ContactRow = memo(ContactRowBase);

function RowIcon({
  icon,
  label,
  onPress,
  disabled,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={s.iconBtn}
    >
      <Ionicons name={icon} size={16} color={tone === 'danger' ? COLORS.error : COLORS.primary} />
    </PressableScale>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    main: { flex: 1, minWidth: 0, paddingVertical: SPACING.xs },
    nameLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    name: {
      fontSize: FONT_SIZE.lg,
      fontWeight: FONT_WEIGHT.medium,
      color: c.textPrimary,
      flexShrink: 1,
    },
    role: { fontSize: FONT_SIZE.sm, color: c.textMuted, marginTop: 2 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    iconBtn: {
      width: 30,
      height: 30,
      borderRadius: RADIUS.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceRaised,
    },
  });
