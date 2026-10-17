import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useTheme } from '../../contexts/theme-context';
import { over } from '../../theme/amazen';
import { AText } from '../amazen';
import { GlyphTile } from './glyph-tile';
import type { GlyphProps } from '../glyphs/glyphs';
import type { StripTone } from './action-strip-state';
import { toneColor, toneTint } from '../../theme/tone-color';

/**
 * ONE box for every strip under the home header — what the app needs from the
 * member. The documents strip and the jobs strip both draw it, so the two can
 * never look like two different products stacked on one screen.
 *
 * It slides in ONCE, on arrival, and never animates to get attention again.
 *
 * ⚠️ OPAQUE, BECAUSE THE GLYPH IS PUNCHED. `contrast` must be the exact colour
 * behind the mark (docs/design/icons/README.md rule 2), and a translucent strip
 * over the home gradient has no single colour. So the strip is the tint
 * composited over the gradient where it sits, and the mark's tile is composited
 * over the strip — both solid, both matchable.
 */
export function StripBox({
  tone, Glyph, count, title, sub, onPress,
}: {
  tone: StripTone;
  /** One item: its mark. */
  Glyph?: React.ComponentType<GlyphProps>;
  /** Several: the count sits where the mark sat. */
  count?: number;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const arrive = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(arrive, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [arrive]);

  const ink = toneColor(c, tone, c.ink);
  const ground = over(`${amazen.gradient.ground[1]}80`, amazen.gradient.ground[0]);
  const tint = over(toneTint(c, tone, c.tile), ground);

  return (
    <Animated.View
      style={{
        opacity: arrive,
        transform: [{ translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        marginBottom: amazen.space(3),
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${sub}`}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: amazen.space(3),
          minHeight: 54, paddingVertical: 11, paddingHorizontal: 14,
          borderRadius: 18, borderWidth: 1, borderColor: tone === 'calm' ? c.lineGlass : `${ink}2e`,
          backgroundColor: tint, opacity: pressed ? 0.85 : 1,
        })}
      >
        <GlyphTile Glyph={Glyph} color={ink} tint={tone === 'calm' ? c.tile : `${ink}1f`} behind={tint} glyphSize={17}>
          <AText variant="h3" numeric style={{ color: ink, fontSize: 19, lineHeight: 24 }}>{count ?? ''}</AText>
        </GlyphTile>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AText
            variant="body"
            tone="strong"
            numberOfLines={1}
            style={{ fontSize: 14, lineHeight: 19, fontFamily: amazen.font.sansMedium }}>
            {title}
          </AText>
          <AText variant="caption" numberOfLines={2} style={{ color: tone === 'calm' ? c.inkMuted : ink, marginTop: 1 }}>
            {sub}
          </AText>
        </View>
        <AText variant="body" style={{ color: tone === 'calm' ? c.inkMuted : ink }}>›</AText>
      </Pressable>
    </Animated.View>
  );
}
