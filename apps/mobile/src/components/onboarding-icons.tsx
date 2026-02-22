import React from 'react';
import Svg, { Path, Rect, Circle, G } from 'react-native-svg';

interface IconProps {
  size?: number;
  color: string;
  /** "tinted" = colored icon on light bg (layered opacities).
   *  "solid" = white/light icon on gradient bg (boosted opacities). */
  variant?: 'tinted' | 'solid';
  /** Color for contrast elements (plus sign, star). In solid mode, pass
   *  the background/gradient color so these elements stay visible. */
  contrastColor?: string;
}

/** Opacity scale per variant. Solid mode boosts everything so it pops on gradients. */
function o(tinted: number, solid: number, variant: 'tinted' | 'solid') {
  return variant === 'solid' ? solid : tinted;
}

/**
 * Bold building with rising floors and a plus badge.
 */
export function CreateOrgIcon({ size = 32, color, variant = 'tinted', contrastColor }: IconProps) {
  const v = variant;
  const contrast = contrastColor ?? (variant === 'solid' ? '#000000' : '#ffffff');

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Back building (taller, lighter) */}
      <Rect x={5} y={4} width={12} height={24} rx={2.5}
        fill={color} fillOpacity={o(0.12, 0.2, v)} />
      {/* Front building (shorter, bolder) */}
      <Rect x={15} y={10} width={12} height={18} rx={2.5}
        fill={color} fillOpacity={o(0.25, 0.4, v)} />
      {/* Back building windows */}
      <Rect x={8} y={8} width={2.5} height={2.5} rx={0.6} fill={color} fillOpacity={o(0.35, 0.55, v)} />
      <Rect x={12.5} y={8} width={2.5} height={2.5} rx={0.6} fill={color} fillOpacity={o(0.35, 0.55, v)} />
      <Rect x={8} y={13} width={2.5} height={2.5} rx={0.6} fill={color} fillOpacity={o(0.35, 0.55, v)} />
      <Rect x={12.5} y={13} width={2.5} height={2.5} rx={0.6} fill={color} fillOpacity={o(0.35, 0.55, v)} />
      <Rect x={8} y={18} width={2.5} height={2.5} rx={0.6} fill={color} fillOpacity={o(0.35, 0.55, v)} />
      <Rect x={12.5} y={18} width={2.5} height={2.5} rx={0.6} fill={color} fillOpacity={o(0.35, 0.55, v)} />
      {/* Front building windows */}
      <Rect x={18} y={14} width={2.5} height={2.5} rx={0.6} fill={color} fillOpacity={o(0.5, 0.7, v)} />
      <Rect x={22.5} y={14} width={2.5} height={2.5} rx={0.6} fill={color} fillOpacity={o(0.5, 0.7, v)} />
      <Rect x={18} y={19} width={2.5} height={2.5} rx={0.6} fill={color} fillOpacity={o(0.5, 0.7, v)} />
      <Rect x={22.5} y={19} width={2.5} height={2.5} rx={0.6} fill={color} fillOpacity={o(0.5, 0.7, v)} />
      {/* Door on front building */}
      <Rect x={19.5} y={24} width={4} height={4} rx={1} fill={color} fillOpacity={o(0.6, 0.8, v)} />
      {/* Plus badge */}
      <Circle cx={26} cy={6} r={4.5} fill={color} fillOpacity={o(0.9, 1, v)} />
      <Path d="M26 3.5V8.5M23.5 6H28.5"
        stroke={contrast} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Bold open door with arrow entering.
 */
export function JoinOrgIcon({ size = 32, color, variant = 'tinted' }: IconProps) {
  const v = variant;

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Building/room shape */}
      <Path d="M8 4H22C23.66 4 25 5.34 25 7V25C25 26.66 23.66 28 22 28H8C6.34 28 5 26.66 5 25V7C5 5.34 6.34 4 8 4Z"
        fill={color} fillOpacity={o(0.1, 0.2, v)} />
      {/* Open door panel (3D perspective) */}
      <Path d="M17 6L25 7.5V24.5L17 26V6Z"
        fill={color} fillOpacity={o(0.3, 0.45, v)} />
      {/* Door frame edge */}
      <Path d="M17 6V26"
        stroke={color} strokeWidth={1.2} strokeOpacity={o(0.4, 0.6, v)} />
      {/* Door handle */}
      <Circle cx={23} cy={16.5} r={1}
        fill={color} fillOpacity={o(0.7, 0.9, v)} />
      {/* Entering arrow */}
      <G>
        <Path d="M2 16H13"
          stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeOpacity={o(1, 1, v)} />
        <Path d="M10 12L14 16L10 20"
          stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={o(1, 1, v)} />
      </G>
      {/* Light glow from inside */}
      <Path d="M17 10L14 11V21L17 22"
        fill={color} fillOpacity={o(0.08, 0.15, v)} />
    </Svg>
  );
}

/**
 * Sealed envelope with a VIP badge/ribbon.
 */
export function InvitationIcon({ size = 32, color, variant = 'tinted', contrastColor }: IconProps) {
  const v = variant;
  const contrast = contrastColor ?? (variant === 'solid' ? '#000000' : '#ffffff');

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Envelope body */}
      <Rect x={3} y={8} width={26} height={18} rx={3}
        fill={color} fillOpacity={o(0.12, 0.2, v)} />
      {/* Envelope flap */}
      <Path d="M3 10.5L16 19L29 10.5"
        stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        strokeOpacity={o(0.3, 0.5, v)} />
      {/* Inner fold shadow */}
      <Path d="M3 11L16 19.5L29 11V23C29 24.66 27.66 26 26 26H6C4.34 26 3 24.66 3 23V11Z"
        fill={color} fillOpacity={o(0.06, 0.12, v)} />
      {/* Seal badge */}
      <Circle cx={16} cy={12} r={5.5} fill={color} fillOpacity={o(0.85, 1, v)} />
      <Circle cx={16} cy={12} r={4} fill={color} fillOpacity={o(0.95, 1, v)} />
      {/* Star inside seal */}
      <Path d="M16 8.5L17.1 10.7L19.5 11L17.7 12.7L18.2 15.1L16 13.9L13.8 15.1L14.3 12.7L12.5 11L14.9 10.7Z"
        fill={contrast} fillOpacity={0.95} />
      {/* Ribbon tails */}
      <Path d="M12.5 16L10.5 21L13 19.5"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
        strokeOpacity={o(1, 1, v)} fill="none" />
      <Path d="M19.5 16L21.5 21L19 19.5"
        stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
        strokeOpacity={o(1, 1, v)} fill="none" />
    </Svg>
  );
}
