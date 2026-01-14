/**
 * DOERGO Design System Tokens
 *
 * This file contains all design tokens extracted from the Figma designs.
 * Use these tokens consistently across all apps (web-partner, web-office, mobile).
 */

// =============================================================================
// COLORS
// =============================================================================

export const colors = {
  // Brand Colors
  brand: {
    primary: '#2563EB',      // Main blue - buttons, links, active states
    primaryHover: '#1D4ED8', // Darker blue for hover
    primaryLight: '#DBEAFE', // Light blue for backgrounds
    accent: '#F97316',       // Orange - logo accent, urgent indicators
    accentLight: '#FED7AA',  // Light orange for backgrounds
  },

  // Neutral Colors
  neutral: {
    white: '#FFFFFF',
    background: '#F8FAFC',   // Light gray background
    border: '#E2E8F0',       // Border color
    divider: '#F1F5F9',      // Divider/separator color
  },

  // Text Colors
  text: {
    primary: '#1E293B',      // Main text color
    secondary: '#64748B',    // Muted/secondary text
    tertiary: '#94A3B8',     // Placeholder text
    inverse: '#FFFFFF',      // White text on dark backgrounds
    link: '#2563EB',         // Link color
  },

  // Status Colors
  status: {
    // Success/Completed
    success: '#22C55E',
    successLight: '#DCFCE7',
    successBorder: '#86EFAC',

    // In Progress
    inProgress: '#3B82F6',
    inProgressLight: '#DBEAFE',
    inProgressBorder: '#93C5FD',

    // Pending/Waiting
    pending: '#EAB308',
    pendingLight: '#FEF9C3',
    pendingBorder: '#FDE047',

    // Scheduled
    scheduled: '#F97316',
    scheduledLight: '#FFEDD5',
    scheduledBorder: '#FDBA74',

    // Error/Declined
    error: '#EF4444',
    errorLight: '#FEE2E2',
    errorBorder: '#FCA5A5',

    // Blocked/Busy
    blocked: '#6B7280',
    blockedLight: '#F3F4F6',
    blockedBorder: '#D1D5DB',

    // Vacation/Away
    away: '#8B5CF6',
    awayLight: '#EDE9FE',
    awayBorder: '#C4B5FD',
  },

  // Sidebar
  sidebar: {
    background: '#FFFFFF',
    activeBackground: '#2563EB',
    activeText: '#FFFFFF',
    hoverBackground: '#F1F5F9',
    text: '#64748B',
    icon: '#94A3B8',
  },
} as const;

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const typography = {
  // Font Family
  fontFamily: {
    sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
    mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
  },

  // Font Sizes (in rem)
  fontSize: {
    xs: '0.75rem',     // 12px
    sm: '0.875rem',    // 14px
    base: '1rem',      // 16px
    lg: '1.125rem',    // 18px
    xl: '1.25rem',     // 20px
    '2xl': '1.5rem',   // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
  },

  // Font Weights
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  // Line Heights
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
} as const;

// =============================================================================
// SPACING
// =============================================================================

export const spacing = {
  0: '0',
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  5: '1.25rem',   // 20px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  10: '2.5rem',   // 40px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
  20: '5rem',     // 80px
} as const;

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const borderRadius = {
  none: '0',
  sm: '0.25rem',    // 4px - small elements
  md: '0.375rem',   // 6px - inputs
  lg: '0.5rem',     // 8px - buttons, cards
  xl: '0.75rem',    // 12px - larger cards
  '2xl': '1rem',    // 16px - modals
  full: '9999px',   // Pill-shaped badges
} as const;

// =============================================================================
// SHADOWS
// =============================================================================

export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  card: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  dropdown: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  modal: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
} as const;

// =============================================================================
// BREAKPOINTS
// =============================================================================

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// =============================================================================
// Z-INDEX
// =============================================================================

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  modalBackdrop: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  toast: 80,
} as const;

// =============================================================================
// TRANSITIONS
// =============================================================================

export const transitions = {
  fast: '150ms ease-in-out',
  normal: '200ms ease-in-out',
  slow: '300ms ease-in-out',
} as const;

// =============================================================================
// COMPONENT SPECIFIC TOKENS
// =============================================================================

export const components = {
  // Sidebar
  sidebar: {
    width: '256px',
    collapsedWidth: '80px',
    itemHeight: '44px',
    iconSize: '20px',
  },

  // Header
  header: {
    height: '64px',
    mobileHeight: '56px',
  },

  // Cards
  card: {
    padding: '1.5rem',
    borderRadius: '0.75rem',
    shadow: shadows.card,
  },

  // Buttons
  button: {
    height: {
      sm: '32px',
      md: '40px',
      lg: '48px',
    },
    padding: {
      sm: '0 12px',
      md: '0 16px',
      lg: '0 24px',
    },
    borderRadius: '0.5rem',
  },

  // Inputs
  input: {
    height: '40px',
    padding: '0 12px',
    borderRadius: '0.375rem',
    borderColor: colors.neutral.border,
    focusBorderColor: colors.brand.primary,
  },

  // Status Badges
  badge: {
    height: '24px',
    padding: '0 10px',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '500',
  },

  // Avatar
  avatar: {
    sizes: {
      sm: '32px',
      md: '40px',
      lg: '48px',
      xl: '64px',
    },
  },

  // Modal
  modal: {
    maxWidth: {
      sm: '400px',
      md: '500px',
      lg: '640px',
      xl: '768px',
    },
    borderRadius: '1rem',
  },
} as const;

// =============================================================================
// STATUS BADGE VARIANTS
// =============================================================================

export const statusBadgeVariants = {
  completed: {
    background: colors.status.successLight,
    color: colors.status.success,
    border: colors.status.successBorder,
  },
  inProgress: {
    background: colors.status.inProgressLight,
    color: colors.status.inProgress,
    border: colors.status.inProgressBorder,
  },
  pending: {
    background: colors.status.pendingLight,
    color: colors.status.pending,
    border: colors.status.pendingBorder,
  },
  scheduled: {
    background: colors.status.scheduledLight,
    color: colors.status.scheduled,
    border: colors.status.scheduledBorder,
  },
  blocked: {
    background: colors.status.blockedLight,
    color: colors.status.blocked,
    border: colors.status.blockedBorder,
  },
  canceled: {
    background: colors.status.errorLight,
    color: colors.status.error,
    border: colors.status.errorBorder,
  },
} as const;

// =============================================================================
// PRIORITY VARIANTS
// =============================================================================

export const priorityVariants = {
  low: {
    color: colors.status.blocked,
    label: 'Low',
  },
  medium: {
    color: colors.status.pending,
    label: 'Medium',
  },
  high: {
    color: colors.status.scheduled,
    label: 'High',
  },
  urgent: {
    color: colors.status.error,
    label: 'Urgent',
  },
} as const;

// =============================================================================
// AVAILABILITY VARIANTS (for workers/technicians)
// =============================================================================

export const availabilityVariants = {
  available: {
    background: colors.status.successLight,
    color: colors.status.success,
    label: 'Available',
  },
  busy: {
    background: colors.status.blockedLight,
    color: colors.status.blocked,
    label: 'Busy',
  },
  onVacation: {
    background: colors.status.awayLight,
    color: colors.status.away,
    label: 'On Vacation',
  },
} as const;
