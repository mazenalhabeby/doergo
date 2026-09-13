import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

interface FingerprintIconProps {
  size?: number;
  color: string;
}

/**
 * One colour, depth from layered opacities — the `onboarding-icons` style, not
 * the stock Ionicon. The ridges darken toward the centre, which is where the
 * eye lands and where a finger goes.
 */
export function FingerprintIcon({ size = 64, color }: FingerprintIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Circle cx={32} cy={32} r={30} fill={color} fillOpacity={0.08} />
      <G stroke={color} strokeWidth={2.6} strokeLinecap="round" fill="none">
        <Path d="M18 22c3.6-4.6 8.4-7 14-7s10.4 2.4 14 7" strokeOpacity={0.45} />
        <Path d="M14.5 33c0-9.8 7.8-17 17.5-17S49.5 23.2 49.5 33v2.5" strokeOpacity={0.55} />
        <Path d="M20 44c-1-3-1.5-6-1.5-9.5 0-7.6 6-13.5 13.5-13.5s13.5 5.9 13.5 13.5c0 4-.8 7.4-2.2 10.6" strokeOpacity={0.7} />
        <Path d="M25.5 49c-1.6-4.4-2.4-9-2.4-14 0-5 4-9 8.9-9s8.9 4 8.9 9c0 5.8-1.1 10.4-3.1 14.2" strokeOpacity={0.85} />
        <Path d="M32 33.5c0 7-.8 12.4-3 17.5" />
        <Path d="M36.2 51c1.3-3.8 2-8 2-12.6" strokeOpacity={0.9} />
      </G>
    </Svg>
  );
}
