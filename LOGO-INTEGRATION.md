# HBCField Logo Integration Guide

> **For Claude Code / Developer use.** This document contains everything needed to replace the old Doergo branding with the new HBCField "Field Arrow — Horizon" logo throughout the codebase.

---

## 1. Brand Summary

| Property | Old (Doergo) | New (HBCField) |
|----------|-------------|----------------|
| Name | Doergo | HBCField |
| Icon | Gear/cog | Origami arrow (green→blue gradient) |
| Wordmark | "Doergo" | "HBC FIELD" (single color, not split) |
| Tagline | Field Service Management | DISPATCH · TRACK · DELIVER |
| Font | Inter | Outfit (logo), Inter (UI — unchanged) |
| Primary color | `#2563EB` (blue-600) | Gradient: `#059669` → `#3b82f6` |

---

## 2. Color Palette Update

### New Brand Colors

| Token | Hex | Tailwind | CSS Variable | Usage |
|-------|-----|----------|--------------|-------|
| Brand Green | `#059669` | `emerald-600` | `--brand-green` | Arrow top facet, primary accent |
| Brand Green Light | `#10b981` | `emerald-500` | `--brand-green-light` | Hover states, secondary accent |
| Brand Blue | `#3b82f6` | `blue-500` | `--brand-blue` | Arrow bottom facet, links |
| Brand Blue Deep | `#1e40af` | `blue-800` | `--brand-blue-deep` | Arrow center fold |
| Brand Dark | `#047857` | `emerald-700` | `--brand-dark-green` | Arrow shadow (top) |
| Brand Dark Blue | `#1e3a8a` | `blue-900` | `--brand-dark-blue` | Arrow shadow (bottom) |
| App Icon BG Start | `#064e3b` | `emerald-900` | — | App icon gradient start |
| App Icon BG End | `#059669` | `emerald-600` | — | Middle of app icon gradient |
| App Icon BG Mid | `#1e40af` | `blue-800` | — | App icon gradient end |

### Keep Existing

The semantic colors (success, warning, error, info), neutral colors, and all other UI colors remain unchanged.

### CSS Variables to Update

```css
:root {
  /* Replace old brand variables */
  --brand-600: #059669;       /* Was #2563EB — primary actions */
  --brand-700: #047857;       /* Was #1D4ED8 — hover states */
  --brand-100: #ecfdf5;       /* Was #DBEAFE — light backgrounds */

  /* New gradient variables */
  --brand-gradient: linear-gradient(135deg, #059669, #3b82f6);
  --brand-gradient-dark: linear-gradient(135deg, #047857, #1e40af);
  --brand-gradient-icon: linear-gradient(160deg, #064e3b, #059669 40%, #1e40af 70%, #1e3a8a);
}
```

---

## 3. SVG Assets

### 3.1 — Icon Only (standalone arrow mark)

Use for: app icon, favicon, small spaces, loading screens.

```svg
<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="arrow-top" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <linearGradient id="arrow-bottom" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
    <linearGradient id="arrow-center" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#047857"/>
      <stop offset="100%" stop-color="#1e40af"/>
    </linearGradient>
  </defs>
  <g transform="translate(24,24)">
    <!-- Top facet (green) -->
    <polygon points="18,-2 -10,-20 -2,-2" fill="url(#arrow-top)"/>
    <!-- Bottom facet (blue) -->
    <polygon points="18,2 -10,20 -2,2" fill="url(#arrow-bottom)"/>
    <!-- Center fold line -->
    <polygon points="-2,-2 18,0 -2,2 -16,0" fill="url(#arrow-center)" opacity="0.8"/>
    <!-- Top shadow -->
    <polygon points="-10,-20 -16,0 -2,-2" fill="#047857" opacity="0.45"/>
    <!-- Bottom shadow -->
    <polygon points="-10,20 -16,0 -2,2" fill="#1e3a8a" opacity="0.25"/>
  </g>
</svg>
```

### 3.2 — Icon Only (white, for use on colored/dark backgrounds)

```svg
<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(24,24)">
    <polygon points="18,-2 -10,-20 -2,-2" fill="rgba(255,255,255,0.9)"/>
    <polygon points="18,2 -10,20 -2,2" fill="rgba(255,255,255,0.6)"/>
    <polygon points="-2,-2 18,0 -2,2 -16,0" fill="rgba(255,255,255,0.4)"/>
    <polygon points="-10,-20 -16,0 -2,-2" fill="rgba(255,255,255,0.2)"/>
    <polygon points="-10,20 -16,0 -2,2" fill="rgba(255,255,255,0.1)"/>
  </g>
</svg>
```

### 3.3 — Full Logo (dark background)

Text is white. Icon uses the green→blue gradient.

```svg
<svg width="310" height="64" viewBox="0 0 310 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fl-top" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <linearGradient id="fl-bottom" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
    <linearGradient id="fl-center" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#047857"/>
      <stop offset="100%" stop-color="#1e40af"/>
    </linearGradient>
  </defs>
  <!-- Arrow icon -->
  <g transform="translate(24,32)">
    <polygon points="18,-2 -8,-20 -2,-2" fill="url(#fl-top)"/>
    <polygon points="18,2 -8,20 -2,2" fill="url(#fl-bottom)"/>
    <polygon points="-2,-2 18,0 -2,2 -14,0" fill="url(#fl-center)" opacity="0.8"/>
    <polygon points="-8,-20 -14,0 -2,-2" fill="#047857" opacity="0.45"/>
    <polygon points="-8,20 -14,0 -2,2" fill="#1e3a8a" opacity="0.25"/>
  </g>
  <!-- Wordmark -->
  <text x="52" y="28" font-family="Outfit, Inter, system-ui, sans-serif" font-weight="800" font-size="24" fill="#fafafa" letter-spacing="-0.5">HBC FIELD</text>
  <!-- Tagline -->
  <text x="52" y="46" font-family="Outfit, Inter, system-ui, sans-serif" font-weight="400" font-size="9" letter-spacing="3" fill="#52525b">DISPATCH · TRACK · DELIVER</text>
</svg>
```

### 3.4 — Full Logo (light background)

Text is dark. Icon uses the same gradient.

```svg
<svg width="310" height="64" viewBox="0 0 310 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fl2-top" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <linearGradient id="fl2-bottom" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
    <linearGradient id="fl2-center" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#047857"/>
      <stop offset="100%" stop-color="#1e40af"/>
    </linearGradient>
  </defs>
  <!-- Arrow icon -->
  <g transform="translate(24,32)">
    <polygon points="18,-2 -8,-20 -2,-2" fill="url(#fl2-top)"/>
    <polygon points="18,2 -8,20 -2,2" fill="url(#fl2-bottom)"/>
    <polygon points="-2,-2 18,0 -2,2 -14,0" fill="url(#fl2-center)" opacity="0.8"/>
    <polygon points="-8,-20 -14,0 -2,-2" fill="#047857" opacity="0.45"/>
    <polygon points="-8,20 -14,0 -2,2" fill="#1e3a8a" opacity="0.25"/>
  </g>
  <!-- Wordmark -->
  <text x="52" y="28" font-family="Outfit, Inter, system-ui, sans-serif" font-weight="800" font-size="24" fill="#18181b" letter-spacing="-0.5">HBC FIELD</text>
  <!-- Tagline -->
  <text x="52" y="46" font-family="Outfit, Inter, system-ui, sans-serif" font-weight="400" font-size="9" letter-spacing="3" fill="#a1a1aa">DISPATCH · TRACK · DELIVER</text>
</svg>
```

### 3.5 — App Icon (for mobile app store, splash screen)

Background is the gradient, arrow is white.

```svg
<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="icon-bg" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#064e3b"/>
      <stop offset="40%" stop-color="#059669"/>
      <stop offset="70%" stop-color="#1e40af"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="1024" height="1024" rx="224" fill="url(#icon-bg)"/>
  <!-- White arrow centered -->
  <g transform="translate(512,512) scale(10)">
    <polygon points="18,-2 -10,-20 -2,-2" fill="rgba(255,255,255,0.9)"/>
    <polygon points="18,2 -10,20 -2,2" fill="rgba(255,255,255,0.6)"/>
    <polygon points="-2,-2 18,0 -2,2 -16,0" fill="rgba(255,255,255,0.4)"/>
    <polygon points="-10,-20 -16,0 -2,-2" fill="rgba(255,255,255,0.2)"/>
    <polygon points="-10,20 -16,0 -2,2" fill="rgba(255,255,255,0.1)"/>
  </g>
</svg>
```

---

## 4. React Component — `AnimatedLogo`

Replace the existing `AnimatedLogo` in `packages/shared/components/`. The component should support the same API as before.

### Props Interface

```typescript
interface AnimatedLogoProps {
  variant?: 'dark' | 'light';   // 'dark' = for dark backgrounds (white text), 'light' = for light backgrounds (dark text)
  size?: 'small' | 'default' | 'large';
  showTagline?: boolean;
  className?: string;
}
```

### Size Map

| Size | Icon height | Font size (wordmark) | Font size (tagline) |
|------|------------|---------------------|---------------------|
| small | 32px (h-8) | 16px | 7px |
| default | 40px (h-10) | 20px | 8px |
| large | 56px (h-14) | 28px | 10px |

### Implementation Notes

```tsx
// packages/shared/components/AnimatedLogo.tsx

import React from 'react';

// Arrow icon as a reusable sub-component
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

export const AnimatedLogo: React.FC<AnimatedLogoProps> = ({
  variant = 'light',
  size = 'default',
  showTagline = false,
  className = '',
}) => {
  const s = sizeMap[size];
  const textColor = variant === 'dark' ? '#fafafa' : '#18181b';
  const taglineColor = variant === 'dark' ? '#52525b' : '#a1a1aa';

  return (
    <div className={`flex items-center ${className}`} style={{ gap: s.gap }}>
      <FieldArrowIcon size={s.icon} variant="color" />
      <div className="flex flex-col">
        <span
          style={{
            fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
            fontWeight: 800,
            fontSize: s.text,
            color: textColor,
            letterSpacing: '-0.5px',
            lineHeight: 1.2,
          }}
        >
          HBC FIELD
        </span>
        {showTagline && (
          <span
            style={{
              fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
              fontWeight: 400,
              fontSize: s.tagline,
              color: taglineColor,
              letterSpacing: '3px',
              lineHeight: 1.4,
            }}
          >
            DISPATCH · TRACK · DELIVER
          </span>
        )}
      </div>
    </div>
  );
};

export default AnimatedLogo;
```

### Usage (same API, drop-in replacement)

```tsx
import { AnimatedLogo } from '@doergo/shared/components';
// Note: package name may also need renaming to @hbcfield/shared

<AnimatedLogo />                          // Default: light bg, dark text, color arrow
<AnimatedLogo variant="dark" />           // Dark bg, white text, color arrow
<AnimatedLogo size="large" />             // Large variant
<AnimatedLogo showTagline />              // With "DISPATCH · TRACK · DELIVER"
<AnimatedLogo variant="dark" size="large" showTagline />  // All options
```

---

## 5. React Native (Mobile) — Icon Component

For the Expo mobile app, create a similar component:

```tsx
// apps/mobile/src/components/FieldArrowIcon.tsx

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
```

---

## 6. Expo / Mobile App Config Updates

### app.json / app.config.ts

```json
{
  "expo": {
    "name": "HBCField",
    "slug": "hbcfield",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#09090b"
    },
    "ios": {
      "bundleIdentifier": "eu.hbc-group.hbcfield"
    },
    "android": {
      "package": "eu.hbcgroup.hbcfield",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#059669"
      }
    }
  }
}
```

### Assets to Generate from the SVGs Above

| Asset | Size | Source |
|-------|------|--------|
| `icon.png` | 1024x1024 | Section 3.5 (app icon SVG) |
| `adaptive-icon.png` | 1024x1024 | White arrow on transparent bg |
| `splash.png` | 1284x2778 | Dark bg (#09090b) + color arrow + "HBC FIELD" text |
| `favicon.png` | 48x48 | Section 3.1 (color arrow icon) |

---

## 7. Files to Update (Checklist)

### Rename / Rebrand

- [ ] `packages/shared/components/AnimatedLogo.tsx` — Replace with new component (Section 4)
- [ ] All imports of `AnimatedLogo` — same API, should just work after replacement
- [ ] `package.json` files — rename `@doergo/*` to `@hbcfield/*` if desired
- [ ] `apps/mobile/app.json` or `app.config.ts` — update name, slug, icons (Section 6)
- [ ] `apps/web-app/` — update `<title>`, favicon, any hardcoded "Doergo" strings
- [ ] `apps/web-app/public/` — replace favicon.ico, apple-touch-icon, og-image
- [ ] `design-system.md` — update brand identity section and primary colors

### CSS / Tailwind Updates

- [ ] Global CSS file — update `--brand-600`, `--brand-700`, `--brand-100` variables
- [ ] `tailwind.config.ts` — if custom brand colors are defined, update the values
- [ ] Any hardcoded `#2563EB` / `blue-600` used specifically for brand (not for semantic "info") — replace with `#059669` / `emerald-600`

### Text Replacements

Search and replace across the codebase:

| Find | Replace With |
|------|-------------|
| `Doergo` (display name) | `HBCField` |
| `doergo` (slug/package) | `hbcfield` |
| `@doergo/` (package scope) | `@hbcfield/` (if renaming packages) |
| `DOERGO` (env vars, constants) | `HBCFIELD` |
| `"Field Service Management"` (tagline) | `"Dispatch · Track · Deliver"` |

### Font: Add Outfit

Add Outfit font for the logo wordmark only (UI remains Inter):

**Web (Next.js):**
```tsx
// apps/web-app/src/app/layout.tsx
import { Inter, Outfit } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['400', '800'] });

// Add to <html> className: `${inter.variable} ${outfit.variable}`
```

**Mobile (Expo):**
```tsx
// apps/mobile/App.tsx or _layout.tsx
import { useFonts, Outfit_400Regular, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
```

---

## 8. Arrow Geometry Reference

The arrow is built from 5 polygons in a 48x48 viewBox, centered at (24,24):

| Polygon | Points | Fill | Purpose |
|---------|--------|------|---------|
| Top facet | `18,-2 -10,-20 -2,-2` | Green gradient | Main visible face (top) |
| Bottom facet | `18,2 -10,20 -2,2` | Blue gradient | Main visible face (bottom) |
| Center fold | `-2,-2 18,0 -2,2 -16,0` | Green→blue gradient, 80% opacity | Depth/fold line |
| Top shadow | `-10,-20 -16,0 -2,-2` | `#047857` at 45% opacity | 3D depth (top) |
| Bottom shadow | `-10,20 -16,0 -2,2` | `#1e3a8a` at 25% opacity | 3D depth (bottom) |

The arrow points **right** (→), suggesting forward motion, dispatch, and progress.

---

## 9. Quick Visual Reference

```
                    ╱╲
  Green facet →   ╱    ╲
                ╱   ───→  ╲  ← Arrow tip points right
                ╲   ───→  ╱
  Blue facet →    ╲    ╱
                    ╲╱

  + "HBC FIELD" in single neutral color (white on dark, dark on light)
  + "DISPATCH · TRACK · DELIVER" tagline in muted gray
```
