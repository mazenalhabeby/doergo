'use client';

export interface AnimatedLogoProps {
  className?: string;
  size?: 'small' | 'default' | 'large';
  variant?: 'dark' | 'light';
  showTagline?: boolean;
  /** Override text color directly */
  textColor?: string;
  /** @deprecated Use variant instead. Kept for backward compatibility. */
  primaryColor?: string;
}

const FieldArrowIcon = ({ size, variant }: { size: number; variant: 'color' | 'white' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    {variant === 'color' ? (
      <>
        <defs>
          <linearGradient id={`arrow-top-${size}`} x1="0" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="#059669"/>
            <stop offset="100%" stopColor="#10b981"/>
          </linearGradient>
          <linearGradient id={`arrow-bottom-${size}`} x1="0" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="#3b82f6"/>
            <stop offset="100%" stopColor="#60a5fa"/>
          </linearGradient>
          <linearGradient id={`arrow-center-${size}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#047857"/>
            <stop offset="100%" stopColor="#1e40af"/>
          </linearGradient>
        </defs>
        <g transform="translate(24,24)">
          <polygon points="18,-2 -10,-20 -2,-2" fill={`url(#arrow-top-${size})`}/>
          <polygon points="18,2 -10,20 -2,2" fill={`url(#arrow-bottom-${size})`}/>
          <polygon points="-2,-2 18,0 -2,2 -16,0" fill={`url(#arrow-center-${size})`} opacity="0.8"/>
          <polygon points="-10,-20 -16,0 -2,-2" fill="#047857" opacity="0.45"/>
          <polygon points="-10,20 -16,0 -2,2" fill="#1e3a8a" opacity="0.25"/>
        </g>
      </>
    ) : (
      <g transform="translate(24,24)">
        <polygon points="18,-2 -10,-20 -2,-2" fill="rgba(255,255,255,0.9)"/>
        <polygon points="18,2 -10,20 -2,2" fill="rgba(255,255,255,0.6)"/>
        <polygon points="-2,-2 18,0 -2,2 -16,0" fill="rgba(255,255,255,0.4)"/>
        <polygon points="-10,-20 -16,0 -2,-2" fill="rgba(255,255,255,0.2)"/>
        <polygon points="-10,20 -16,0 -2,2" fill="rgba(255,255,255,0.1)"/>
      </g>
    )}
  </svg>
);

const sizeMap = {
  small:   { icon: 32, text: 16, tagline: 7,  gap: 6,  height: 'h-8'  },
  default: { icon: 40, text: 20, tagline: 8,  gap: 8,  height: 'h-10' },
  large:   { icon: 56, text: 28, tagline: 10, gap: 10, height: 'h-14' },
};

export function AnimatedLogo({
  className = '',
  size = 'default',
  variant = 'dark',
  showTagline = false,
  textColor,
}: AnimatedLogoProps) {
  const s = sizeMap[size];
  const isLight = variant === 'light';
  const resolvedColor = textColor || (isLight ? '#fafafa' : undefined);

  return (
    <div className={`flex items-center ${className}`} style={{ gap: s.gap }}>
      {/* On dark backgrounds (variant="light") render the icon in white so the
          blue half of the arrow doesn't disappear into the background. */}
      <FieldArrowIcon size={s.icon} variant={isLight ? 'white' : 'color'} />
      <div className="flex flex-col">
        <span
          style={{
            fontWeight: 800,
            letterSpacing: '-0.5px',
            lineHeight: 1.2,
            fontSize: s.text,
            color: resolvedColor,
          }}
        >
          HBC FIELD
        </span>
        {showTagline && (
          <span
            style={{
              fontWeight: 400,
              textTransform: 'uppercase' as const,
              fontSize: s.tagline,
              letterSpacing: '3px',
              lineHeight: 1.4,
              color: resolvedColor,
              opacity: 0.5,
            }}
          >
            DISPATCH · TRACK · DELIVER
          </span>
        )}
      </div>
    </div>
  );
}

export { FieldArrowIcon };
export default AnimatedLogo;
