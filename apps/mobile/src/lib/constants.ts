/**
 * Centralized constants for the mobile app
 * Single source of truth for colors, sizes, spacing, and configuration
 */

// =============================================================================
// COLORS
// =============================================================================

export const COLORS = {
  // Brand
  primary: '#2563EB',
  primaryLight: '#eff6ff',
  primaryDark: '#1d4ed8',

  // Neutral
  white: '#ffffff',
  black: '#000000',

  // Slate scale (backgrounds, borders, text)
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',

  // Semantic
  success: '#16a34a',
  successLight: '#dcfce7',
  successBorder: '#bbf7d0',

  warning: '#ca8a04',
  warningLight: '#fef9c3',
  warningBorder: '#fde047',

  error: '#dc2626',
  errorLight: '#fef2f2',
  errorBorder: '#fecaca',

  info: '#2563eb',
  infoLight: '#eff6ff',
  infoBorder: '#bfdbfe',

  // Status specific
  amber: '#d97706',
  amberLight: '#fffbeb',
  amberBorder: '#fde68a',

  purple: '#7c3aed',
  purpleLight: '#f5f3ff',
  purpleBorder: '#c4b5fd',

  emerald: '#059669',
  emeraldLight: '#ecfdf5',
  emeraldBorder: '#a7f3d0',
} as const;

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
  accessToken: 'doergo_access_token',
  refreshToken: 'doergo_refresh_token',
  user: 'doergo_user',
} as const;

// =============================================================================
// ROUTES
// =============================================================================

export const ROUTES = {
  // Auth
  login: '/(auth)/login' as const,

  // App tabs
  home: '/(app)' as const,
  tasks: '/(app)/(tabs)/tasks' as const,
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
