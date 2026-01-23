/**
 * Design Constants
 *
 * Centralized design tokens for colors, styles, and UI configuration.
 * Used across web and mobile apps for consistent styling.
 */

import { TaskStatus, TaskPriority } from '../types';

// =============================================================================
// PRIORITY COLORS
// =============================================================================

export interface PriorityColors {
  /** Main color (hex) for charts, icons */
  hex: string;
  /** Tailwind class for background when active/selected */
  bgActive: string;
  /** Tailwind class for border when active/selected */
  borderActive: string;
  /** Tailwind class for text */
  text: string;
  /** Tailwind class for light background (badges, cards) */
  bgLight: string;
  /** Tailwind class for border (cards) */
  border: string;
  /** Tailwind class for left accent border */
  borderLeft: string;
  /** React Native / Mobile color values */
  mobile: {
    bg: string;
    bgLight: string;
    text: string;
    border: string;
  };
}

export const PRIORITY_COLORS: Record<TaskPriority, PriorityColors> = {
  [TaskPriority.LOW]: {
    hex: '#64748b',
    bgActive: 'bg-slate-900',
    borderActive: 'border-slate-900',
    text: 'text-slate-600',
    bgLight: 'bg-slate-100',
    border: 'border-slate-200',
    borderLeft: 'border-l-slate-500',
    mobile: {
      bg: '#0f172a',
      bgLight: '#f1f5f9',
      text: '#475569',
      border: '#e2e8f0',
    },
  },
  [TaskPriority.MEDIUM]: {
    hex: '#2563eb',
    bgActive: 'bg-blue-600',
    borderActive: 'border-blue-600',
    text: 'text-blue-600',
    bgLight: 'bg-blue-100',
    border: 'border-blue-200',
    borderLeft: 'border-l-blue-600',
    mobile: {
      bg: '#2563eb',
      bgLight: '#dbeafe',
      text: '#2563eb',
      border: '#bfdbfe',
    },
  },
  [TaskPriority.HIGH]: {
    hex: '#d97706',
    bgActive: 'bg-amber-600',
    borderActive: 'border-amber-600',
    text: 'text-amber-600',
    bgLight: 'bg-amber-100',
    border: 'border-amber-300',
    borderLeft: 'border-l-amber-600',
    mobile: {
      bg: '#d97706',
      bgLight: '#fef3c7',
      text: '#d97706',
      border: '#fcd34d',
    },
  },
  [TaskPriority.URGENT]: {
    hex: '#dc2626',
    bgActive: 'bg-red-600',
    borderActive: 'border-red-600',
    text: 'text-red-600',
    bgLight: 'bg-red-100',
    border: 'border-red-300',
    borderLeft: 'border-l-red-600',
    mobile: {
      bg: '#dc2626',
      bgLight: '#fee2e2',
      text: '#dc2626',
      border: '#fca5a5',
    },
  },
};

// =============================================================================
// STATUS COLORS
// =============================================================================

export interface StatusColors {
  /** Main color (hex) for charts */
  hex: string;
  /** Tailwind class for text */
  text: string;
  /** Tailwind class for light background */
  bgLight: string;
  /** Tailwind class for border */
  border: string;
  /** Display label */
  label: string;
  /** React Native / Mobile color values */
  mobile: {
    bg: string;
    bgLight: string;
    text: string;
    border: string;
  };
}

export const STATUS_COLORS: Record<TaskStatus, StatusColors> = {
  [TaskStatus.DRAFT]: {
    hex: '#94a3b8',
    text: 'text-slate-600',
    bgLight: 'bg-slate-100',
    border: 'border-slate-300',
    label: 'Draft',
    mobile: {
      bg: '#64748b',
      bgLight: '#f1f5f9',
      text: '#475569',
      border: '#cbd5e1',
    },
  },
  [TaskStatus.NEW]: {
    hex: '#2563eb',
    text: 'text-blue-700',
    bgLight: 'bg-blue-100',
    border: 'border-blue-300',
    label: 'New',
    mobile: {
      bg: '#2563eb',
      bgLight: '#dbeafe',
      text: '#1d4ed8',
      border: '#93c5fd',
    },
  },
  [TaskStatus.ASSIGNED]: {
    hex: '#7c3aed',
    text: 'text-purple-700',
    bgLight: 'bg-purple-100',
    border: 'border-purple-300',
    label: 'Assigned',
    mobile: {
      bg: '#7c3aed',
      bgLight: '#ede9fe',
      text: '#6d28d9',
      border: '#c4b5fd',
    },
  },
  [TaskStatus.ACCEPTED]: {
    hex: '#059669',
    text: 'text-emerald-700',
    bgLight: 'bg-emerald-100',
    border: 'border-emerald-300',
    label: 'Accepted',
    mobile: {
      bg: '#059669',
      bgLight: '#d1fae5',
      text: '#047857',
      border: '#6ee7b7',
    },
  },
  [TaskStatus.EN_ROUTE]: {
    hex: '#0891b2',
    text: 'text-cyan-700',
    bgLight: 'bg-cyan-100',
    border: 'border-cyan-300',
    label: 'On The Way',
    mobile: {
      bg: '#0891b2',
      bgLight: '#cffafe',
      text: '#0e7490',
      border: '#67e8f9',
    },
  },
  [TaskStatus.ARRIVED]: {
    hex: '#4f46e5',
    text: 'text-indigo-700',
    bgLight: 'bg-indigo-100',
    border: 'border-indigo-300',
    label: 'Arrived',
    mobile: {
      bg: '#4f46e5',
      bgLight: '#e0e7ff',
      text: '#4338ca',
      border: '#a5b4fc',
    },
  },
  [TaskStatus.IN_PROGRESS]: {
    hex: '#d97706',
    text: 'text-amber-700',
    bgLight: 'bg-amber-100',
    border: 'border-amber-300',
    label: 'In Progress',
    mobile: {
      bg: '#d97706',
      bgLight: '#fef3c7',
      text: '#b45309',
      border: '#fcd34d',
    },
  },
  [TaskStatus.BLOCKED]: {
    hex: '#dc2626',
    text: 'text-red-700',
    bgLight: 'bg-red-100',
    border: 'border-red-300',
    label: 'Blocked',
    mobile: {
      bg: '#dc2626',
      bgLight: '#fee2e2',
      text: '#b91c1c',
      border: '#fca5a5',
    },
  },
  [TaskStatus.COMPLETED]: {
    hex: '#16a34a',
    text: 'text-green-700',
    bgLight: 'bg-green-100',
    border: 'border-green-300',
    label: 'Completed',
    mobile: {
      bg: '#16a34a',
      bgLight: '#dcfce7',
      text: '#15803d',
      border: '#86efac',
    },
  },
  [TaskStatus.CANCELED]: {
    hex: '#64748b',
    text: 'text-slate-500',
    bgLight: 'bg-slate-100',
    border: 'border-slate-300',
    label: 'Canceled',
    mobile: {
      bg: '#64748b',
      bgLight: '#f1f5f9',
      text: '#64748b',
      border: '#cbd5e1',
    },
  },
  [TaskStatus.CLOSED]: {
    hex: '#475569',
    text: 'text-slate-400',
    bgLight: 'bg-slate-50',
    border: 'border-slate-200',
    label: 'Closed',
    mobile: {
      bg: '#475569',
      bgLight: '#f8fafc',
      text: '#94a3b8',
      border: '#e2e8f0',
    },
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get priority colors by priority string
 */
export function getPriorityColors(priority: string): PriorityColors {
  const normalized = priority.toUpperCase() as TaskPriority;
  return PRIORITY_COLORS[normalized] || PRIORITY_COLORS[TaskPriority.MEDIUM];
}

/**
 * Get status colors by status string
 */
export function getStatusColors(status: string): StatusColors {
  const normalized = status.toUpperCase() as TaskStatus;
  return STATUS_COLORS[normalized] || STATUS_COLORS[TaskStatus.DRAFT];
}

/**
 * Check if priority is considered high (HIGH or URGENT)
 */
export function isHighPriority(priority: string): boolean {
  const normalized = priority.toUpperCase();
  return normalized === TaskPriority.HIGH || normalized === TaskPriority.URGENT;
}

/**
 * Get priority label
 */
export function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'Urgent',
  };
  return labels[priority.toUpperCase()] || priority;
}

// =============================================================================
// BRAND COLORS
// =============================================================================

export const BRAND_COLORS = {
  primary: {
    hex: '#2563eb',
    tailwind: 'blue-600',
    mobile: '#2563eb',
  },
  primaryHover: {
    hex: '#1d4ed8',
    tailwind: 'blue-700',
    mobile: '#1d4ed8',
  },
  primaryLight: {
    hex: '#dbeafe',
    tailwind: 'blue-100',
    mobile: '#dbeafe',
  },
  success: {
    hex: '#16a34a',
    tailwind: 'green-600',
    mobile: '#16a34a',
  },
  warning: {
    hex: '#d97706',
    tailwind: 'amber-600',
    mobile: '#d97706',
  },
  error: {
    hex: '#dc2626',
    tailwind: 'red-600',
    mobile: '#dc2626',
  },
} as const;
