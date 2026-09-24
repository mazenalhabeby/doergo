/**
 * Amazen Trust — the v2 design language.
 *
 * Source of truth: `docs/design/shift-clock/TOKENS.md`. The DARK column is
 * transcribed from it verbatim. The LIGHT column is DERIVED — the handoff only
 * published three light values — and every derived colour was alpha-composited
 * against the surface it actually sits on and measured. Derived values are
 * marked ⓓ below and listed in `docs/design/shift-clock/TOKENS.md` §7.
 *
 * ⚠️ Two rules that are easy to break:
 *
 *   1. A colour is measured against the surface it SITS ON, not against the
 *      canvas. `ink-onglass` differs between the Home gradient and the interior
 *      one because their top stops differ — that is why `inkOnGlassHome` is a
 *      token of its own and not a judgement call at the call site.
 *   2. `accent` is INK and `accentLift → accentSolid` is a FILL. They are close
 *      in light mode and must not be swapped: white on `accentLift` at its
 *      published light value (#14a586) measures 3.11:1 and fails. TOKENS.md §3.
 */

export type Scheme = 'light' | 'dark';

export interface AmazenColors {
  /** the ground, under the gradient */
  canvas: string;
  /** the shift card and every raised panel that floats on a gradient */
  glass: string;
  /** its hairline */
  lineGlass: string;
  /** every list */
  well: string;
  /** fields, the photo slots */
  sunken: string;
  /** icon tiles, unfilled discs */
  tile: string;

  /** the hero, row titles */
  inkStrong: string;
  /** body, the unit after the hero */
  ink: string;
  /** sub-lines — ON A WELL ONLY */
  inkMuted: string;
  /** muted text on glass over the INTERIOR gradient */
  inkOnGlass: string;
  /** muted text on glass over the HOME gradient — its top stop is lighter */
  inkOnGlassHome: string;
  /** disc labels — no surface under them */
  inkOnGradient: string;

  /** the live dot, links, active nav — INK, never a fill */
  accent: string;
  /** the filled disc and the primary, top stop */
  accentLift: string;
  /** the filled disc and the primary, bottom stop */
  accentSolid: string;
  /** the label on jade */
  accentInk: string;
  /** your own messages, the sent tick */
  accentTint: string;

  /** blocked, overdue, the open-shift state */
  critical: string;
  criticalTint: string;
  criticalInk: string;

  /**
   * owed, late, waiting for approval, rest overdue.
   * TOKENS.md §2 — a field app has a third state that is neither paid nor
   * declined, and encoding it as `critical` makes every unapproved shift read
   * as a failure.
   */
  warn: string;
  warnTint: string;
  warnInk: string;

  /**
   * The tab pill's own fill — SOLID and OPAQUE, one per theme.
   *
   * ⚠️ NOT `tile`, and not a blur. The bar was translucent glass for a while
   * and it produced two different products: crisp on iOS, and smeared on
   * Android, where `dimezisBlurView` re-renders what is behind it at reduced
   * fidelity every frame of scroll. A surface that is on screen at all times
   * over the one thing people scroll all day is the worst possible place for
   * an experimental blur, and there is no tuning that makes the two platforms
   * agree — the difference is the implementation, not the parameters.
   *
   * An opaque colour renders identically everywhere, costs nothing, and is
   * what the light reference actually shows.
   */
  barFill: string;
  /** The active tab's capsule — solid for the same reason as `barFill`. */
  barCapsule: string;

  /** input borders — SOLID, never an alpha wash */
  lineField: string;
  /** a divider inside a well */
  lineWell: string;
}

export interface AmazenGradients {
  /** the home screen's ground */
  home: readonly string[];
  homeLocations: readonly number[];
  /** every other screen's ground */
  interior: readonly string[];
  interiorLocations: readonly number[];
  /** the primary button and the filled disc */
  primary: readonly string[];
}

const DARK: AmazenColors = {
  canvas: '#040507',
  glass: '#ffffff1a',
  lineGlass: '#ffffff1c',
  well: '#0b0f12',
  sunken: '#0c1013',
  tile: '#ffffff14',

  inkStrong: '#f1f6fa',
  ink: '#acb6bf',
  inkMuted: '#808b95',
  inkOnGlass: '#9fbdb4',
  inkOnGlassHome: '#b0cbc2', // ⓓ TOKENS §3 asked for this; #9fbdb4 is 4.14:1 there
  inkOnGradient: '#98a9a2',

  accent: '#66dbba',
  accentLift: '#7fe6c8',
  accentSolid: '#10b993',
  accentInk: '#001810',
  accentTint: '#66dbba24',

  critical: '#fd978c',
  criticalTint: '#2e1512',
  criticalInk: '#2a0d08', // ⓓ

  warn: '#f2b263',
  warnTint: '#f2b2631f',
  warnInk: '#1a1200',

  barFill: '#191c20', // measured off the design reference
  barCapsule: '#283736', // measured — `accentTint` over the bar, resolved
  lineField: '#616871',
  lineWell: '#ffffff12', // ⓓ
};

const LIGHT: AmazenColors = {
  canvas: '#f3f7f5', // ⓓ
  glass: '#ffffffa8', // ⓓ
  lineGlass: '#0b332a1f', // ⓓ
  well: '#ffffff', // ⓓ
  sunken: '#eef3f1', // ⓓ
  tile: '#0b332a0f', // ⓓ

  inkStrong: '#0b1f1a', // ⓓ
  ink: '#485752', // ⓓ
  inkMuted: '#63726d', // ⓓ
  inkOnGlass: '#4e6b64', // published in TOKENS §3
  inkOnGlassHome: '#4e6b64', // the light home stop is the SAFER one — 5.17:1
  inkOnGradient: '#3a544d', // ⓓ

  accent: '#097058', // ⓓ ink: 5.38:1 at its worst (glass over the home gradient)
  accentLift: '#087961', // published in TOKENS §3 as the light primary's top stop
  accentSolid: '#0b8168', // published in TOKENS §3
  accentInk: '#ffffff',
  accentTint: '#0b816818', // ⓓ

  critical: '#b03127', // ⓓ
  criticalTint: '#b0312714', // ⓓ
  criticalInk: '#ffffff', // ⓓ

  warn: '#8a5a10', // published in TOKENS §2
  warnTint: '#8a5a1018', // published in TOKENS §2
  warnInk: '#ffffff', // published in TOKENS §2

  barFill: '#f9fcff', // measured off the light reference
  barCapsule: '#e7f0f0', // measured
  lineField: '#7f8f89', // ⓓ 3.02:1 on sunken
  lineWell: '#0b332a14', // ⓓ
};

const DARK_GRADIENTS: AmazenGradients = {
  home: ['#0c4339', '#09291f', '#061a19', '#050c0f', '#040507'],
  homeLocations: [0, 0.26, 0.52, 0.78, 1],
  interior: ['#0a3229', '#06181a', '#040d10', '#040507'],
  interiorLocations: [0, 0.24, 0.5, 1],
  primary: ['#7fe6c8', '#10b993'],
};

const LIGHT_GRADIENTS: AmazenGradients = {
  // ⓓ — solved backwards from TOKENS §3, which measures light `ink-onglass`
  // against glass over #bfe0d2, so that is the home gradient's top stop.
  home: ['#bfe0d2', '#d5ece1', '#e6f2ec', '#f0f6f3', '#f3f7f5'],
  homeLocations: [0, 0.26, 0.52, 0.78, 1],
  interior: ['#cbe5d9', '#e4f0eb', '#f0f6f3', '#f3f7f5'],
  interiorLocations: [0, 0.24, 0.5, 1],
  // TOKENS §3: NOT accentLift's published light value — white on #14a586 is
  // 3.11:1. This pair is 5.36:1 and 4.82:1 and still reads as a lit jade pill.
  primary: ['#087961', '#0b8168'],
};

// =============================================================================
// GEOMETRY — TOKENS §4
// =============================================================================

export const RADIUS = {
  /** the only square in the kit */
  tile: 14,
  /** fields, photo slots */
  field: 18,
  /** wells */
  panel: 26,
  /** the shift card */
  surface: 30,
  /** the three sheets, TOP CORNERS ONLY */
  sheet: 32,
  /** discs, pills, the tab bar — the default */
  full: 999,
} as const;

/** A 4px grid. `space(5)` is the screen gutter. */
export const space = (n: number) => n * 4;

export const LAYOUT = {
  /** screen gutter */
  gutter: space(5), // 20
  /** between blocks */
  block: 13,
  /** top inset — NO STATUS BAR IS EVER DRAWN */
  topInset: space(14), // 56
  /**
   * ⚠️ REMOVED — THE BAR IS NOT A FIXED HEIGHT.
   *
   * This was `tabSafe: 110`, and a flat number cannot be right: the pill sits
   * on the safe-area inset, which is 24pt on gesture Android, 48pt on three
   * buttons, 34pt on a notched iPhone and 0 on an iPhone SE. 110 covered the
   * one device it was measured on and hid 22pt of the last row on three-button
   * Android and 8pt on every notched iPhone.
   *
   * The reservation now comes from `useTabSafe()` in
   * `components/amazen/tab-pill.tsx`, which is where the bar's own geometry is
   * written down — so the room a screen leaves and the room the bar takes can
   * no longer disagree. `tab-safe.spec.ts` fails if a screen goes back to a
   * constant.
   */
  /** ≥44 everywhere; the discs are 58, because gloves */
  tapMin: 44,
  disc: 58,
} as const;

// =============================================================================
// TYPE — TOKENS §5
// =============================================================================

export const FONT = {
  /** everything */
  sans: 'ReadexPro_400Regular',
  sansLight: 'ReadexPro_300Light',
  sansMedium: 'ReadexPro_500Medium',
  /** numerals read digit by digit — times, durations, ids, amounts. NEVER prose */
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const TYPE = {
  /** the hero. ONE PER SCREEN */
  display: { fontFamily: FONT.sansLight, fontSize: 64, lineHeight: 66, letterSpacing: -3 },
  /** the week total, the batch count */
  displaySm: { fontFamily: FONT.sansLight, fontSize: 57, lineHeight: 60, letterSpacing: -2.4 },
  /** the unit after the hero */
  decimal: { fontFamily: FONT.sans, fontSize: 29, lineHeight: 36, letterSpacing: -1 },
  /** sheet titles, the workspace */
  h2: { fontFamily: FONT.sansMedium, fontSize: 23, lineHeight: 32, letterSpacing: -0.4 },
  /** section titles, button labels */
  h3: { fontFamily: FONT.sansMedium, fontSize: 19, lineHeight: 28 },
  /** default, every row title */
  body: { fontFamily: FONT.sans, fontSize: 15, lineHeight: 24 },
  /** sub-lines, disc labels */
  caption: { fontFamily: FONT.sans, fontSize: 12, lineHeight: 16 },
  /**
   * `ON THE CLOCK` — mono, uppercase, and therefore LATIN ONLY.
   * ⚠️ The app ships de/es/fr/it — all cased — but never set an eyebrow in a
   * script that has no case.
   */
  eyebrow: {
    fontFamily: FONT.mono,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2.4,
    textTransform: 'uppercase' as const,
  },
} as const;

// =============================================================================
// MOTION — TOKENS §6
// =============================================================================

export const MOTION = {
  /** state changes */
  state: 120,
  /** entrances */
  enter: 180,
  /** sheets */
  sheet: 240,
  /** the one curve */
  easing: [0.2, 0.8, 0.2, 1] as const,
} as const;

// =============================================================================

export interface Amazen {
  scheme: Scheme;
  color: AmazenColors;
  gradient: AmazenGradients;
  radius: typeof RADIUS;
  layout: typeof LAYOUT;
  type: typeof TYPE;
  font: typeof FONT;
  motion: typeof MOTION;
  space: typeof space;
}

/**
 * Alpha-composite `fg` over an opaque `bg`, as a solid hex.
 *
 * ⚠️ Needed because a translucent token is not a colour you can MATCH. A badge
 * ring, a punched glyph's `contrast`, a notch cut out of a surface — each has
 * to be the exact value the eye sees, and `#ffffff14` over the canvas is a
 * different number from either of them. Guessing draws a grey ghost.
 */
export function over(fg: string, bg: string): string {
  const parse = (h: string) => {
    const x = h.replace('#', '');
    const full = x.length === 3 ? x.split('').map((ch) => ch + ch).join('') : x;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
    };
  };
  const f = parse(fg);
  const b = parse(bg);
  const mix = (x: number, y: number) => Math.round(x * f.a + y * (1 - f.a));
  return (
    '#' +
    [mix(f.r, b.r), mix(f.g, b.g), mix(f.b, b.b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function getAmazen(scheme: Scheme): Amazen {
  const dark = scheme === 'dark';
  return {
    scheme,
    color: dark ? DARK : LIGHT,
    gradient: dark ? DARK_GRADIENTS : LIGHT_GRADIENTS,
    radius: RADIUS,
    layout: LAYOUT,
    type: TYPE,
    font: FONT,
    motion: MOTION,
    space,
  };
}

export const AMAZEN_DARK = getAmazen('dark');
export const AMAZEN_LIGHT = getAmazen('light');
