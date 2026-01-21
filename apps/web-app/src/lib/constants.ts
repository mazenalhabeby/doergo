/**
 * Centralized constants for the web app
 * Task status, priority, colors, and filter options
 *
 * Note: Tailwind classes must remain in this file (not imported dynamically)
 * because Tailwind purges unused classes at build time. Hex colors for charts
 * are imported from the shared package for consistency.
 */

import { ArrowDown, ArrowUp, Minus, AlertTriangle, type LucideIcon } from "lucide-react"
import { TaskPriority, TaskStatus } from "@doergo/shared/types"
import { PRIORITY_COLORS, STATUS_COLORS } from "@doergo/shared/constants"

// =============================================================================
// TASK STATUS
// =============================================================================

// Re-export TaskStatus from shared for convenience
export { TaskStatus } from "@doergo/shared/types"

export const TASK_STATUSES = [
  "DRAFT",
  "NEW",
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE",
  "ARRIVED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELED",
  "CLOSED",
] as const

export type StatusConfig = {
  label: string
  className: string
  hex: string
  bgClass: string
  textClass: string
  borderClass: string
}

export const STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  DRAFT: {
    label: STATUS_COLORS[TaskStatus.DRAFT].label,
    className: "bg-slate-100 text-slate-600 hover:bg-slate-100",
    hex: STATUS_COLORS[TaskStatus.DRAFT].hex,
    bgClass: "bg-slate-50",
    textClass: "text-slate-600",
    borderClass: "border-l-slate-400",
  },
  NEW: {
    label: STATUS_COLORS[TaskStatus.NEW].label,
    className: "bg-blue-100 text-blue-700 hover:bg-blue-100",
    hex: STATUS_COLORS[TaskStatus.NEW].hex,
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    borderClass: "border-l-blue-500",
  },
  ASSIGNED: {
    label: STATUS_COLORS[TaskStatus.ASSIGNED].label,
    className: "bg-purple-100 text-purple-700 hover:bg-purple-100",
    hex: STATUS_COLORS[TaskStatus.ASSIGNED].hex,
    bgClass: "bg-purple-50",
    textClass: "text-purple-700",
    borderClass: "border-l-purple-500",
  },
  ACCEPTED: {
    label: STATUS_COLORS[TaskStatus.ACCEPTED].label,
    className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
    hex: STATUS_COLORS[TaskStatus.ACCEPTED].hex,
    bgClass: "bg-emerald-50",
    textClass: "text-emerald-700",
    borderClass: "border-l-emerald-500",
  },
  EN_ROUTE: {
    label: STATUS_COLORS[TaskStatus.EN_ROUTE].label,
    className: "bg-cyan-100 text-cyan-700 hover:bg-cyan-100",
    hex: STATUS_COLORS[TaskStatus.EN_ROUTE].hex,
    bgClass: "bg-cyan-50",
    textClass: "text-cyan-700",
    borderClass: "border-l-cyan-500",
  },
  ARRIVED: {
    label: STATUS_COLORS[TaskStatus.ARRIVED].label,
    className: "bg-indigo-100 text-indigo-700 hover:bg-indigo-100",
    hex: STATUS_COLORS[TaskStatus.ARRIVED].hex,
    bgClass: "bg-indigo-50",
    textClass: "text-indigo-700",
    borderClass: "border-l-indigo-500",
  },
  IN_PROGRESS: {
    label: STATUS_COLORS[TaskStatus.IN_PROGRESS].label,
    className: "bg-amber-100 text-amber-700 hover:bg-amber-100",
    hex: STATUS_COLORS[TaskStatus.IN_PROGRESS].hex,
    bgClass: "bg-orange-50",
    textClass: "text-orange-700",
    borderClass: "border-l-orange-500",
  },
  BLOCKED: {
    label: STATUS_COLORS[TaskStatus.BLOCKED].label,
    className: "bg-red-100 text-red-700 hover:bg-red-100",
    hex: STATUS_COLORS[TaskStatus.BLOCKED].hex,
    bgClass: "bg-red-50",
    textClass: "text-red-700",
    borderClass: "border-l-red-500",
  },
  COMPLETED: {
    label: STATUS_COLORS[TaskStatus.COMPLETED].label,
    className: "bg-green-100 text-green-700 hover:bg-green-100",
    hex: STATUS_COLORS[TaskStatus.COMPLETED].hex,
    bgClass: "bg-green-50",
    textClass: "text-green-700",
    borderClass: "border-l-green-500",
  },
  CANCELED: {
    label: STATUS_COLORS[TaskStatus.CANCELED].label,
    className: "bg-slate-100 text-slate-500 hover:bg-slate-100",
    hex: STATUS_COLORS[TaskStatus.CANCELED].hex,
    bgClass: "bg-slate-50",
    textClass: "text-slate-500",
    borderClass: "border-l-slate-400",
  },
  CLOSED: {
    label: STATUS_COLORS[TaskStatus.CLOSED].label,
    className: "bg-slate-50 text-slate-400 hover:bg-slate-50",
    hex: STATUS_COLORS[TaskStatus.CLOSED].hex,
    bgClass: "bg-slate-50",
    textClass: "text-slate-400",
    borderClass: "border-l-slate-300",
  },
}

/**
 * Get status configuration by status string
 */
export function getStatusConfig(status: string): StatusConfig {
  const normalized = status.toUpperCase() as TaskStatus
  return STATUS_CONFIG[normalized] || STATUS_CONFIG.DRAFT
}

/**
 * Get hex color for a status (for charts)
 */
export function getStatusHex(status: string): string {
  return getStatusConfig(status).hex
}

// =============================================================================
// TASK PRIORITY
// =============================================================================

// Re-export TaskPriority from shared for convenience
export { TaskPriority } from "@doergo/shared/types"

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const

export type PriorityConfig = {
  label: string
  description: string
  className: string
  hex: string
  icon: LucideIcon
  baseStyle: string
  activeStyle: string
  dotColor: string
}

export const PRIORITY_CONFIG: Record<TaskPriority, PriorityConfig> = {
  LOW: {
    label: "Low",
    description: "No rush",
    className: "bg-slate-100 text-slate-500 hover:bg-slate-100",
    hex: PRIORITY_COLORS[TaskPriority.LOW].hex,
    icon: ArrowDown,
    baseStyle: "border-slate-200 hover:border-slate-300",
    activeStyle: "border-slate-900 bg-slate-900 text-white",
    dotColor: "bg-slate-400",
  },
  MEDIUM: {
    label: "Medium",
    description: "Standard",
    className: "bg-blue-100 text-blue-600 hover:bg-blue-100",
    hex: PRIORITY_COLORS[TaskPriority.MEDIUM].hex,
    icon: Minus,
    baseStyle: "border-slate-200 hover:border-blue-300",
    activeStyle: "border-blue-600 bg-blue-600 text-white",
    dotColor: "bg-blue-500",
  },
  HIGH: {
    label: "High",
    description: "Important",
    className: "bg-amber-100 text-amber-700 hover:bg-amber-100",
    hex: PRIORITY_COLORS[TaskPriority.HIGH].hex,
    icon: ArrowUp,
    baseStyle: "border-slate-200 hover:border-amber-300",
    activeStyle: "border-amber-600 bg-amber-600 text-white",
    dotColor: "bg-amber-600",
  },
  URGENT: {
    label: "Urgent",
    description: "Critical",
    className: "bg-red-100 text-red-600 hover:bg-red-100",
    hex: PRIORITY_COLORS[TaskPriority.URGENT].hex,
    icon: AlertTriangle,
    baseStyle: "border-slate-200 hover:border-red-300",
    activeStyle: "border-red-600 bg-red-600 text-white",
    dotColor: "bg-red-500",
  },
}

/**
 * Get priority configuration by priority string
 */
export function getPriorityConfig(priority: string): PriorityConfig {
  const normalized = priority.toUpperCase() as TaskPriority
  return PRIORITY_CONFIG[normalized] || PRIORITY_CONFIG.MEDIUM
}

/**
 * Get hex color for a priority (for charts)
 */
export function getPriorityHex(priority: string): string {
  return getPriorityConfig(priority).hex
}

// =============================================================================
// FILTER OPTIONS
// =============================================================================

export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "NEW", label: "New" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELED", label: "Canceled" },
  { value: "CLOSED", label: "Closed" },
] as const

export const PRIORITY_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const

// =============================================================================
// CHART COLORS (for compatibility with existing chart components)
// =============================================================================

export const taskStatusColors: Record<TaskStatus, string> = {
  NEW: STATUS_CONFIG.NEW.hex,
  ASSIGNED: STATUS_CONFIG.ASSIGNED.hex,
  ACCEPTED: STATUS_CONFIG.ACCEPTED.hex,
  EN_ROUTE: STATUS_CONFIG.EN_ROUTE.hex,
  ARRIVED: STATUS_CONFIG.ARRIVED.hex,
  IN_PROGRESS: STATUS_CONFIG.IN_PROGRESS.hex,
  BLOCKED: STATUS_CONFIG.BLOCKED.hex,
  COMPLETED: STATUS_CONFIG.COMPLETED.hex,
  CANCELED: STATUS_CONFIG.CANCELED.hex,
  DRAFT: STATUS_CONFIG.DRAFT.hex,
  CLOSED: STATUS_CONFIG.CLOSED.hex,
}

export const priorityColors: Record<TaskPriority, string> = {
  LOW: PRIORITY_CONFIG.LOW.hex,
  MEDIUM: PRIORITY_CONFIG.MEDIUM.hex,
  HIGH: PRIORITY_CONFIG.HIGH.hex,
  URGENT: PRIORITY_CONFIG.URGENT.hex,
}

// =============================================================================
// FORM STYLES
// =============================================================================

export const FORM_STYLES = {
  input:
    "h-12 rounded-xl border-slate-200 bg-white text-base placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500/20",
  textarea:
    "rounded-xl border-slate-200 bg-white text-base placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500/20 resize-none",
  select:
    "h-12 rounded-xl border-slate-200 bg-white text-base focus:border-blue-500 focus:ring-blue-500/20",
  label: "text-sm font-medium text-slate-700",
} as const

// =============================================================================
// AVATAR STYLES
// =============================================================================

export const AVATAR_STYLES = {
  user: "bg-blue-100 text-blue-600 font-medium",
  technician: "bg-orange-100 text-orange-600 font-medium",
  client: "bg-green-100 text-green-600 font-medium",
  default: "bg-slate-100 text-slate-600 font-medium",
} as const

// =============================================================================
// API ROUTES
// =============================================================================

export const ROUTES = {
  dashboard: "/",
  tasks: "/tasks",
  taskDetail: (id: string) => `/tasks/${id}`,
  taskNew: "/tasks/new",
  technicians: "/technicians",
  technicianDetail: (id: string) => `/technicians/${id}`,
  liveMap: "/live-map",
  organizations: "/organizations",
  login: "/login",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
} as const
