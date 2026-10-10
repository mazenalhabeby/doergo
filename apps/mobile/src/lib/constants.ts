/**
 * Centralized constants for the mobile app
 * Single source of truth for colors, sizes, spacing, and configuration
 */

import { AMAZEN_DARK, AMAZEN_LIGHT, type AmazenColors } from '../theme/amazen';

// =============================================================================
// COLORS
// =============================================================================

/*
  v2 — the fixed palette, nudged onto Amazen Trust.

  These are scheme-INDEPENDENT and therefore cannot satisfy both grounds: a
  jade that reads on white cannot also read on #0b0f12. They are kept because
  legacy screens use them as fills and accents on a light ground, and they are
  now the Amazen LIGHT values so the two never disagree by a hue.

  ⚠️ New code reads `useTheme().amazen.color` — it is scheme-aware and has the
  tokens this object has no answer for.
*/
export const COLORS = {
  // Brand — Amazen Trust light jade
  primary: '#0b8168',
  primaryLight: '#e7f3ef',
  primaryDark: '#087961',

  // Accent
  accent: '#F97316',
  accentLight: '#FED7AA',

  // Neutral
  white: '#FFFFFF',
  black: '#000000',

  // Slate scale (backgrounds, borders, text)
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',

  // Semantic — 500-weight (brighter, matches design tokens)
  success: '#0b8168',
  successLight: '#e7f3ef',
  successBorder: '#a9d6c8',

  warning: '#8a5a10',
  warningLight: '#f6efe6',
  warningBorder: '#dcc49b',

  error: '#b03127',
  errorLight: '#f9eceb',
  errorBorder: '#e3b3ae',

  info: '#0b8168',
  infoLight: '#e7f3ef',
  infoBorder: '#a9d6c8',

  // In Progress (blue-500)
  inProgress: '#3B82F6',
  inProgressLight: '#DBEAFE',
  inProgressBorder: '#93C5FD',

  // Status specific
  amber: '#8a5a10',
  amberLight: '#f6efe6',
  amberBorder: '#dcc49b',

  purple: '#8B5CF6',
  purpleLight: '#EDE9FE',
  purpleBorder: '#C4B5FD',
  purpleDark: '#6D28D9',

  emerald: '#0b8168',
  emeraldLight: '#e7f3ef',
  emeraldBorder: '#a9d6c8',
  emeraldDark: '#087961',

  cyan: '#0891B2',
  cyanLight: '#CFFAFE',
  cyanBorder: '#67E8F9',

  indigo: '#4F46E5',
  indigoLight: '#E0E7FF',
  indigoBorder: '#A5B4FC',

  blocked: '#6B7280',
  blockedLight: '#F3F4F6',
  blockedBorder: '#D1D5DB',
} as const;

// =============================================================================
// THEME COLORS (semantic tokens that change with light/dark mode)
// =============================================================================

/*
  v2 — Amazen Trust.

  These two objects are no longer hand-picked colours. They are a MAPPING of
  the legacy semantic keys onto `src/theme/amazen.ts`, so that every screen
  written against `useTheme().colors` re-skins without being touched, and the
  two languages can never disagree about what "the card colour" is.

  New code should read `useTheme().amazen` instead — it has the tokens this
  map has no key for (glass, the gradients, ink-on-glass, warn).
*/
function mapLegacy(a: AmazenColors): Record<string, string> {
  return {
    background: a.canvas,
    surface: a.well,
    surfaceRaised: a.tile,
    card: a.well,
    input: a.sunken,
    inputBorder: a.lineField,
    inputIconBg: a.tile,
    border: a.lineWell,
    borderLight: a.lineField,
    textPrimary: a.inkStrong,
    textSecondary: a.ink,
    textMuted: a.inkMuted,
    tabBar: a.canvas,
    header: a.canvas,
    // Light-weight semantic grounds. Amazen has three tones, not eleven: jade
    // for anything affirmative, warn for owed/late/waiting, critical for
    // failure. Everything else is the neutral tile.
    primaryLight: a.accentTint,
    successLight: a.accentTint,
    errorLight: a.criticalTint,
    warningLight: a.warnTint,
    inProgressLight: a.accentTint,
    purpleLight: a.tile,
    amberLight: a.warnTint,
    emeraldLight: a.accentTint,
    cyanLight: a.tile,
    indigoLight: a.tile,
    blockedLight: a.tile,
  };
}

const LIGHT_THEME = mapLegacy(AMAZEN_LIGHT.color) as Record<LegacyThemeKey, string>;
const DARK_THEME = mapLegacy(AMAZEN_DARK.color) as Record<LegacyThemeKey, string>;

type LegacyThemeKey =
  | 'background' | 'surface' | 'surfaceRaised' | 'card' | 'input' | 'inputBorder'
  | 'inputIconBg' | 'border' | 'borderLight' | 'textPrimary' | 'textSecondary'
  | 'textMuted' | 'tabBar' | 'header' | 'primaryLight' | 'successLight'
  | 'errorLight' | 'warningLight' | 'inProgressLight' | 'purpleLight'
  | 'amberLight' | 'emeraldLight' | 'cyanLight' | 'indigoLight' | 'blockedLight';

export type ThemeColors = Record<LegacyThemeKey, string>;

export function getThemeColors(scheme: 'light' | 'dark' | null | undefined): ThemeColors {
  return scheme === 'dark' ? DARK_THEME : LIGHT_THEME;
}

// =============================================================================
// SPACING
// =============================================================================

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

// =============================================================================
// FONT SIZES
// =============================================================================

export const FONT_SIZE = {
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 15,
  xl: 16,
  xxl: 18,
  xxxl: 22,
  title: 28,
} as const;

// =============================================================================
// FONT WEIGHTS
// =============================================================================

export const FONT_WEIGHT = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// =============================================================================
// SHADOWS
// =============================================================================

export const SHADOWS = {
  sm: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

// =============================================================================
// ANIMATION
// =============================================================================
// =============================================================================
// API & STORAGE
// =============================================================================
// =============================================================================
// ROUTES
// =============================================================================

export const ROUTES = {
  // Auth
  login: '/(auth)/login' as const,
  register: '/(auth)/register' as const,
  forgotPassword: '/(auth)/forgot-password' as const,

  // Onboarding
  choosePath: '/(onboarding)/choose-path' as const,
  createOrg: '/(onboarding)/create-org' as const,
  joinOrg: '/(onboarding)/join-org' as const,
  useInvitation: '/(onboarding)/use-invitation' as const,
  pendingApproval: '/(onboarding)/pending-approval' as const,

  // App tabs
  home: '/(app)' as const,
  tasks: '/(app)/(tabs)/tasks' as const,
  createTask: '/(app)/(tabs)/create-task' as const,
  attendance: '/(app)/(tabs)/attendance' as const,
  timeOff: '/(app)/(tabs)/time-off' as const,
  profile: '/(app)/(tabs)/profile' as const,

  // Task detail (function to generate dynamic route)
  taskDetail: (id: string) => `/task/${id}` as const,
} as const;

// =============================================================================
// PAGINATION
// =============================================================================
