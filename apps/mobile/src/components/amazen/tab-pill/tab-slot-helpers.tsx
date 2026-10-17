import { View } from 'react-native';
import { useTheme } from '../../../contexts/theme-context';
import { AText } from '../text';
import { Bump } from '../motion';

/** TabSlot's module-level helpers, moved here unchanged so its sections can read them too. */
/**
 * ⚠️ A badge is a COUNT, never a dot, and it caps at 9+. "Something is
 * waiting" without a number is a thing to check; 3 is a thing to plan around,
 * and past nine the exact number stops changing the decision.
 *
 * ⚠️ And a badge must never be the only reason a request happens. If nothing
 * else on screen already knows the count, the tab draws no number rather than
 * firing a call to decorate itself.
 */
export function Badge({ count, ring, glow = false }: { count: number; ring: string; glow?: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    // Pops when the number changes while on screen (a new message), never on first draw.
    <Bump value={count}>
      <View
        style={{
          minWidth: 19,
          height: 19,
          paddingHorizontal: 5,
          borderRadius: amazen.radius.full,
          /*
            A count waiting for you reads as red everywhere on a phone. The warn
            amber looked brown on the light bar and too quiet for "unread".
          */
          backgroundColor: c.critical,
          alignItems: 'center',
          justifyContent: 'center',
          /* The ring is the bar under it, so the count reads as cut out of the bar. */
          borderWidth: 2,
          borderColor: ring,
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
          style={{ color: c.criticalInk, fontSize: 11, lineHeight: 14, fontFamily: amazen.font.sansMedium }}
        >
          {count > 9 ? '9+' : String(count)}
        </AText>
      </View>
    </Bump>
  );
}
