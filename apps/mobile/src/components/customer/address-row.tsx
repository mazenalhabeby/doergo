import { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../pressable-scale';
import { useTheme } from '../../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT, type ThemeColors } from '../../lib/constants';
import type { MobileCustomerAddress } from '../../lib/api/customers';

/**
 * One place the work happens: a label, the address, who is there.
 *
 * ⚠️ READ ONLY, deliberately. `customersApi` exposes `addresses(id)` and
 * nothing else — there is no create or update route on the mobile client — and
 * a panel with an Add button whose only possible outcome is a 404 is worse
 * than a panel that plainly lists what exists. Writing here means adding the
 * endpoints first.
 *
 * The one action offered is the one that needs no endpoint: hand the address
 * to the phone's maps app, which is what somebody standing in a van wants from
 * this card anyway.
 */
export const AddressRow = memo(function AddressRow({
  address,
  /** Screen-reader labels; the star and the pin say nothing to one. */
  labels,
}: {
  address: MobileCustomerAddress;
  labels: { primary: string; navigate: string; call: string };
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const text = address.address?.trim();

  return (
    <View style={s.row}>
      <View style={s.main}>
        <View style={s.titleLine}>
          <Text style={s.label} numberOfLines={1}>
            {address.label?.trim() || text || '—'}
          </Text>
          {address.isPrimary && (
            <Ionicons name="star" size={13} color={COLORS.amber} accessibilityLabel={labels.primary} />
          )}
        </View>
        {/* Only when the label is not already the address itself. */}
        {!!text && address.label?.trim() ? <Text style={s.address}>{text}</Text> : null}
        {!!address.contactName && (
          <Text style={s.contact} numberOfLines={1}>
            {address.contactName}
            {address.contactPhone ? ` · ${address.contactPhone}` : ''}
          </Text>
        )}
      </View>

      <View style={s.actions}>
        {!!address.contactPhone && (
          <IconButton
            icon="call"
            label={labels.call}
            onPress={() => void Linking.openURL(`tel:${address.contactPhone}`)}
          />
        )}
        {!!text && (
          <IconButton
            icon="navigate"
            label={labels.navigate}
            /*
              `geo:` with a query is the platform-neutral form — iOS maps it to
              Apple Maps, Android offers whatever the person has installed. A
              hard-coded maps.google.com URL would send an iPhone to the web.
            */
            onPress={() => void Linking.openURL(`geo:0,0?q=${encodeURIComponent(text)}`)}
          />
        )}
      </View>
    </View>
  );
});

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  return (
    <PressableScale onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={s.iconBtn}>
      <Ionicons name={icon} size={16} color={COLORS.primary} />
    </PressableScale>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    main: { flex: 1, minWidth: 0 },
    titleLine: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    label: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.medium, color: c.textPrimary, flexShrink: 1 },
    address: { fontSize: FONT_SIZE.base, color: c.textSecondary, marginTop: 2 },
    contact: { fontSize: FONT_SIZE.sm, color: c.textMuted, marginTop: 3 },
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
