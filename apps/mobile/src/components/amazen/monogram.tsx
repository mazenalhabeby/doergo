import { View } from 'react-native';
import { personInitials } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText } from './text';

/**
 * Initials in a shape — the one drawing for a person or a client without a photo.
 *
 * ⚠️ Shape, never colour, tells a company from a person: a CIRCLE reads as a
 * face and a rounded SQUARE as a building, at any size, in one colour, with no
 * legend (the rule `ClientAvatar` set). A square stays a square only while its
 * corners are well under half its side — hence size × 0.3.
 *
 * One size → font ratio (× 0.33) everywhere; ten copies used to pick their own.
 * `tone`: `accent` (jade tint, the default) for people and clients, `tile` for
 * a quieter mark in a dense list.
 */
export function Monogram({
  name,
  initials,
  size = 42,
  company = false,
  tone = 'accent',
}: {
  /** A display name, or a person's first/last name. */
  name?: string | { firstName?: string | null; lastName?: string | null } | null;
  /** The letters, when the caller already worked them out (e.g. with an academic title removed). */
  initials?: string;
  size?: number;
  company?: boolean;
  tone?: 'accent' | 'tile';
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const text = initials ?? personInitials(name ?? null, '·');
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: company ? Math.round(size * 0.3) : size / 2,
        backgroundColor: tone === 'tile' ? c.tile : c.accentTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AText
        numberOfLines={1}
        style={{
          color: tone === 'tile' ? c.ink : c.accent,
          fontFamily: amazen.font.sansMedium,
          fontSize: Math.round(size * 0.33),
        }}
      >
        {text}
      </AText>
    </View>
  );
}
