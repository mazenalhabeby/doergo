import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { AText } from './text';
import { Bump } from './motion';

/**
 * The one count badge: 18 px, red, caps at 9+.
 *
 * ⚠️ A badge is a COUNT, never a dot. "Something is waiting" without a number is
 * a thing to check; 3 is a thing to plan around, and past nine the exact number
 * stops changing the decision. A count waiting for you reads as red everywhere
 * on a phone — the amber that some copies used looked brown on light surfaces
 * and too quiet for "unread".
 *
 * ⚠️ A badge must never be the only reason a request happens: draw it only from
 * a count something on screen already knows.
 *
 * `ring` is the colour of the surface under it, so the count reads as cut out of
 * it (tab bar, a tile). `style` places it (absolute corners are the caller's).
 */
export function CountBadge({
  count,
  ring,
  glow = false,
  style,
}: {
  count: number;
  ring?: string;
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  if (!count || count <= 0) return null;
  return (
    // Pops when the number changes while on screen (a new message), never on first draw.
    <View pointerEvents="none" style={style}>
      <Bump value={count}>
        <View
          style={{
            minWidth: 18,
            height: 18,
            paddingHorizontal: ring ? 4 : 5,
            borderRadius: amazen.radius.full,
            backgroundColor: c.critical,
            alignItems: 'center',
            justifyContent: 'center',
            ...(ring ? { borderWidth: 2, borderColor: ring } : null),
            ...(glow
              ? {
                  shadowColor: c.critical,
                  shadowOpacity: 0.45,
                  shadowRadius: 5,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 3,
                }
              : null),
          }}
        >
          <AText
            variant="caption"
            numeric
            style={{
              color: c.criticalInk,
              fontSize: ring ? 10 : 11,
              lineHeight: ring ? 12 : 14,
              fontFamily: amazen.font.sansMedium,
            }}
          >
            {count > 9 ? '9+' : String(count)}
          </AText>
        </View>
      </Bump>
    </View>
  );
}
