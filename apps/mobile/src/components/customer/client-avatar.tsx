import { View, Text, StyleSheet } from 'react-native';
import { clientKind, type ClientKind, personInitials } from '@hbcfield/shared/client';
import { COLORS, FONT_WEIGHT, RADIUS } from '../../lib/constants';

/**
 * The client's mark: a SHAPE that says what kind of thing this is.
 *
 * ⚠️ Shape, never colour. Two hues would be the obvious answer and this
 * product forbids a multi-colour icon — and colour is the wrong signal anyway:
 * it carries no meaning until somebody learns the legend, it is the first
 * thing lost to a colour-blind reader, and the app already spends colour on
 * stage and on state. A rounded SQUARE reads as a building and a CIRCLE reads
 * as a face at any size, in one colour, with no legend.
 *
 * ⚠️ `clientKind` from shared, not `customer.type === 'COMPANY'` written out
 * here. An absent type is a PERSON because that is the column's default, and a
 * screen that guessed differently would draw a square for every client created
 * on a phone before the type existed.
 */
export function ClientAvatar({
  customer,
  size = 52,
}: {
  customer: { name?: string | null; type?: string | null } | null | undefined;
  size?: number;
}) {
  const kind: ClientKind = clientKind(customer);
  return (
    <View
      style={[
        s.base,
        {
          width: size,
          height: size,
          // A square is only a square once its corners are much smaller than
          // half its side; at size/2 the two shapes are the same circle.
          borderRadius: kind === 'COMPANY' ? Math.max(RADIUS.md, size * 0.28) : size / 2,
        },
      ]}
    >
      <Text style={[s.text, { fontSize: Math.round(size * 0.36) }]} numberOfLines={1}>
        {personInitials(customer?.name, '')}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    // The brand green is one colour in both themes — the documented exception
    // to taking every surface from the theme.
    backgroundColor: COLORS.primary,
  },
  text: { color: COLORS.white, fontWeight: FONT_WEIGHT.bold, letterSpacing: 0.5 },
});
