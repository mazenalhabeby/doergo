import { useMemo, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../pressable-scale';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, SHADOWS, type ThemeColors } from '../../lib/constants';

/**
 * One card on the client record: a titled header, at most one action, a body.
 *
 * The record screen carries five of these — contacts, addresses, details,
 * the composer, the activity list — and before this they were five different
 * shapes. A flat `ScrollView` with a `<Text>` heading here and a bordered
 * `<View>` there is not a style problem so much as a structural one: there was
 * nowhere to HANG a new section, so every section invented its own container
 * and its own spacing, and the screen read as a list of accidents.
 *
 * ⚠️ The action is a slot, not a button prop. Some cards need a plus, one
 * needs a count, one needs nothing — and a component that grew a boolean per
 * variant would end up with the same five shapes it replaced, only inside.
 *
 * ⚠️ A card with NO TITLE has no header row at all, and that is a real case
 * rather than a degenerate one: the composer's heading said "Log something"
 * above a text box on the Activity tab of a client — which is where you are,
 * doing the only thing there is to do — so it stated the obvious in a heavy
 * chrome the card already provides. An action has nowhere to go without a
 * header, so a headerless card puts its own controls in its body.
 */
export function RecordCard({
  title,
  icon,
  /** A short count or status shown next to the title (e.g. "3"). */
  badge,
  /** One control on the right of the header. Omitted entirely when absent. */
  action,
  /** Dropped into the body when the card would otherwise be empty. */
  empty,
  children,
}: {
  /** Omitted for a headerless card — see the note above. */
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  badge?: string | number;
  action?: ReactNode;
  empty?: string;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  // A card with neither body nor empty line would render a header floating on
  // its own; an empty STATE is content, so it counts as a body.
  const hasBody = children != null || !!empty;

  return (
    <View style={s.card}>
      {!!title && (
        <View style={s.header}>
          {!!icon && (
            <View style={s.iconWrap}>
              <Ionicons name={icon} size={15} color={COLORS.primary} />
            </View>
          )}
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {badge !== undefined && badge !== '' && <Text style={s.badge}>{badge}</Text>}
          <View style={s.spacer} />
          {action}
        </View>
      )}
      {hasBody && (
        // Without a header the body has to supply its own top gap; inheriting
        // the header's would leave the first row sitting on the card's edge.
        <View style={[s.body, !title && s.bodyNoHeader]}>
          {children ?? <Text style={s.empty}>{empty}</Text>}
        </View>
      )}
    </View>
  );
}

/**
 * The header's action when it is a plain icon — "add a contact", "edit".
 *
 * Extracted because three cards want the identical 32px tappable circle, and a
 * fourth written by hand is how one of them ends up 28px with no hit slop.
 */
export function CardAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** Read out by a screen reader — the icon alone says nothing to one. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[s.action, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={17} color={COLORS.primary} />
    </PressableScale>
  );
}

/** A label/value line — how every read-only fact on this screen is rendered. */
export function RecordRow({
  label,
  value,
  /** Draws the value in the muted tone, for "not set" and similar. */
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  return (
    <View style={s.row}>
      <Text style={s.rowLabel} numberOfLines={1}>{label}</Text>
      <Text style={[s.rowValue, muted && { color: colors.textMuted, fontWeight: FONT_WEIGHT.normal }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: RADIUS.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      marginTop: SPACING.md,
      overflow: 'hidden',
      ...SHADOWS.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
    },
    iconWrap: {
      width: 26,
      height: 26,
      borderRadius: RADIUS.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primaryLight,
    },
    title: {
      fontSize: FONT_SIZE.md,
      fontWeight: FONT_WEIGHT.semibold,
      color: c.textPrimary,
      flexShrink: 1,
    },
    badge: {
      fontSize: FONT_SIZE.xs,
      fontWeight: FONT_WEIGHT.semibold,
      color: c.textMuted,
    },
    spacer: { flex: 1 },
    action: {
      width: 32,
      height: 32,
      borderRadius: RADIUS.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primaryLight,
    },
    body: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.lg,
    },
    // Matches the header's own vertical padding, so a headerless card is inset
    // by the same amount top and bottom rather than reading as top-cropped.
    bodyNoHeader: { paddingTop: SPACING.md },
    empty: {
      fontSize: FONT_SIZE.base,
      color: c.textMuted,
      paddingVertical: SPACING.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    rowLabel: {
      fontSize: FONT_SIZE.base,
      color: c.textMuted,
      width: 110,
    },
    rowValue: {
      flex: 1,
      fontSize: FONT_SIZE.base,
      color: c.textPrimary,
      fontWeight: FONT_WEIGHT.medium,
      textAlign: 'right',
    },
  });
