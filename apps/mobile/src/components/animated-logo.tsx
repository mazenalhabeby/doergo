import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

// New faceted brand mark (replaces the old FieldArrowIcon in the wordmark logo).
const LOGO = require('../../assets/logo_HBCFIELD.png');
const LogoMark = ({ size }: { size: number }) => (
  <Image source={LOGO} style={{ width: size, height: size, resizeMode: 'contain' }} />
);

export interface AnimatedLogoProps {
  size?: 'small' | 'default' | 'large';
  variant?: 'light' | 'dark';
  showTagline?: boolean;
  iconOnly?: boolean;
  /** @deprecated Use variant instead */
  primaryColor?: string;
}

const SIZE_MAP = {
  small:   { icon: 32, text: 16, tagline: 7,  gap: 6  },
  default: { icon: 40, text: 20, tagline: 8,  gap: 8  },
  large:   { icon: 56, text: 28, tagline: 10, gap: 10 },
};

export function AnimatedLogo({
  size = 'default',
  variant = 'dark',
  showTagline = false,
  iconOnly = false,
}: AnimatedLogoProps) {
  const s = SIZE_MAP[size];
  const textColor = variant === 'light' ? '#fafafa' : '#18181b';
  const taglineColor = variant === 'light' ? '#52525b' : '#a1a1aa';

  if (iconOnly) {
    return <LogoMark size={s.icon} />;
  }

  return (
    <View style={[styles.container, { gap: s.gap }]}>
      <LogoMark size={s.icon} />
      <View>
        <Text
          style={[
            styles.wordmark,
            { fontSize: s.text, color: textColor },
          ]}
        >
          HBC FIELD
        </Text>
        {showTagline && (
          <Text
            style={[
              styles.tagline,
              { fontSize: s.tagline, color: taglineColor },
            ]}
          >
            DISPATCH · TRACK · DELIVER
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: 'Outfit_800ExtraBold',
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  tagline: {
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    letterSpacing: 3,
    lineHeight: 14,
  },
});
