import React from 'react';
import Svg, { Defs, LinearGradient, Stop, G, Polygon } from 'react-native-svg';

interface Props {
  size?: number;
  variant?: 'color' | 'white';
}

export const FieldArrowIcon: React.FC<Props> = ({ size = 40, variant = 'color' }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    {variant === 'color' ? (
      <>
        <Defs>
          <LinearGradient id="at" x1="0" y1="0" x2="0.5" y2="1">
            <Stop offset="0%" stopColor="#059669" />
            <Stop offset="100%" stopColor="#10b981" />
          </LinearGradient>
          <LinearGradient id="ab" x1="0" y1="0" x2="0.5" y2="1">
            <Stop offset="0%" stopColor="#3b82f6" />
            <Stop offset="100%" stopColor="#60a5fa" />
          </LinearGradient>
          <LinearGradient id="ac" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor="#047857" />
            <Stop offset="100%" stopColor="#1e40af" />
          </LinearGradient>
        </Defs>
        <G transform="translate(24,24)">
          <Polygon points="18,-2 -10,-20 -2,-2" fill="url(#at)" />
          <Polygon points="18,2 -10,20 -2,2" fill="url(#ab)" />
          <Polygon points="-2,-2 18,0 -2,2 -16,0" fill="url(#ac)" opacity="0.8" />
          <Polygon points="-10,-20 -16,0 -2,-2" fill="#047857" opacity="0.45" />
          <Polygon points="-10,20 -16,0 -2,2" fill="#1e3a8a" opacity="0.25" />
        </G>
      </>
    ) : (
      <G transform="translate(24,24)">
        <Polygon points="18,-2 -10,-20 -2,-2" fill="rgba(255,255,255,0.9)" />
        <Polygon points="18,2 -10,20 -2,2" fill="rgba(255,255,255,0.6)" />
        <Polygon points="-2,-2 18,0 -2,2 -16,0" fill="rgba(255,255,255,0.4)" />
        <Polygon points="-10,-20 -16,0 -2,-2" fill="rgba(255,255,255,0.2)" />
        <Polygon points="-10,20 -16,0 -2,2" fill="rgba(255,255,255,0.1)" />
      </G>
    )}
  </Svg>
);
