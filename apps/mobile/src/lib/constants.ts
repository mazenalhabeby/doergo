/**
 * Centralized constants for the mobile app
 * Single source of truth for colors, sizes, spacing, and configuration
 */

// =============================================================================
// COLORS
// =============================================================================

export const COLORS = {
  // Brand (aligned with packages/shared/src/design/tokens.ts)
  primary: '#059669',
  primaryLight: '#ecfdf5',
  primaryDark: '#047857',

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
  success: '#22C55E',
  successLight: '#DCFCE7',
  successBorder: '#86EFAC',

  warning: '#EAB308',
  warningLight: '#FEF9C3',
  warningBorder: '#FDE047',

  error: '#EF4444',
  errorLight: '#FEE2E2',
  errorBorder: '#FCA5A5',

  info: '#059669',
  infoLight: '#ecfdf5',
  infoBorder: '#93C5FD',

  // In Progress (blue-500)
  inProgress: '#3B82F6',
  inProgressLight: '#DBEAFE',
  inProgressBorder: '#93C5FD',

  // Status specific
  amber: '#D97706',
  amberLight: '#FFFBEB',
  amberBorder: '#FDE68A',

  purple: '#8B5CF6',
  purpleLight: '#EDE9FE',
  purpleBorder: '#C4B5FD',
  purpleDark: '#6D28D9',

  emerald: '#059669',
  emeraldLight: '#ECFDF5',
  emeraldBorder: '#A7F3D0',
  emeraldDark: '#047857',

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

const LIGHT_THEME = {
  background: '#FFFFFF',
  surface: '#F8FAFC',
  surfaceRaised: '#F1F5F9',
  card: '#FFFFFF',
  input: '#F1F5F9',
  inputBorder: '#E2E8F0',
  inputIconBg: '#F1F5F9',
  border: '#E2E8F0',
  borderLight: '#CBD5E1',
  textPrimary: '#1E293B',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  tabBar: '#FFFFFF',
  header: '#FFFFFF',
  // Light-weight semantic backgrounds (change in dark mode)
  primaryLight: '#ecfdf5',
  successLight: '#DCFCE7',
  errorLight: '#FEE2E2',
  warningLight: '#FEF9C3',
  inProgressLight: '#DBEAFE',
  purpleLight: '#EDE9FE',
  amberLight: '#FFFBEB',
  emeraldLight: '#ECFDF5',
  cyanLight: '#CFFAFE',
  indigoLight: '#E0E7FF',
  blockedLight: '#F3F4F6',
} as const;

const DARK_THEME = {
  background: '#0c0c14',
  surface: '#131320',
  surfaceRaised: '#1e1e2e',
  card: '#1a1a28',
  input: '#1e1e2e',
  inputBorder: '#2c2c3e',
  inputIconBg: '#262638',
  border: '#232335',
  borderLight: '#363650',
  textPrimary: '#f0f0f8',
  textSecondary: '#9898b0',
  textMuted: '#6a6a82',
  tabBar: '#0a0a10',
  header: '#101018',
  // Rich semantic backgrounds with depth
  primaryLight: '#0a2a20',
  successLight: '#0c2818',
  errorLight: '#2a1018',
  warningLight: '#2a1f0a',
  inProgressLight: '#0c1a32',
  purpleLight: '#1a0c32',
  amberLight: '#221508',
  emeraldLight: '#0a2a20',
  cyanLight: '#081e2a',
  indigoLight: '#141030',
  blockedLight: '#1e1e2e',
} as const;

export type ThemeColors = { [K in keyof typeof LIGHT_THEME]: string };

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

export const ANIMATION = {
  fast: 150,
  normal: 300,
  slow: 500,
  splash: 1000,
} as const;

// =============================================================================
// API & STORAGE
// =============================================================================

export const STORAGE_KEYS = {
  accessToken: 'hbcfield_access_token',
  refreshToken: 'hbcfield_refresh_token',
  user: 'hbcfield_user',
} as const;

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

export const PAGINATION = {
  defaultLimit: 10,
  defaultPage: 1,
} as const;

// =============================================================================
// TIME CONSTANTS
// =============================================================================

export const TIME = {
  secondsPerMinute: 60,
  minutesPerHour: 60,
  hoursPerDay: 24,
  msPerSecond: 1000,
  msPerMinute: 60 * 1000,
  msPerHour: 60 * 60 * 1000,
  msPerDay: 24 * 60 * 60 * 1000,
} as const;
