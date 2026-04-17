import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// =============================================================================
// DATE FORMATTING
// =============================================================================

/**
 * Format a date as relative time ago (e.g., "Just now", "5m ago", "2h ago", "Yesterday")
 * Used for activity feeds, comments, and timeline displays
 */
export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  })
}

/**
 * Format a date as short date (e.g., "Jan 15, 2024")
 */
export function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Format a date as time only (e.g., "2:30 PM")
 */
export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/**
 * Format a date as date and time (e.g., "Jan 15, 2024, 2:30 PM")
 * Consistent format for displaying timestamps throughout the app
 */
export function formatDateTime(dateString: string | Date): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/**
 * Format duration in seconds to human-readable format
 * e.g., 3665 -> "1h 1m 5s", 125 -> "2m 5s", 45 -> "45s"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return "0s"

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

  return parts.join(" ")
}

/**
 * Format duration from milliseconds to human-readable format
 * e.g., 3665000 -> "1h 1m", 125000 -> "2m 5s"
 */
export function formatDurationMs(ms: number): string {
  return formatDuration(Math.floor(ms / 1000))
}

/**
 * Format duration from minutes to human-readable format
 * e.g., 90 -> "1h 30m", 45 -> "45m"
 */
export function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "-"
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  return `${hours}h ${mins}m`
}

/**
 * Format distance in meters to human-readable format
 * e.g., 1500 -> "1.5 km", 500 -> "500 m"
 */
export function formatDistance(meters: number): string {
  if (meters < 0) return "0 m"

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${Math.round(meters)} m`
}

// =============================================================================
// TASK HELPERS
// =============================================================================

/**
 * Generate a display-friendly request ID from a task
 * Uses first 3 letters of org name as prefix (e.g., "ACM-2026-K8U")
 * Falls back to "REQ" if no org name provided
 */
export function getRequestId(task: { id: string; createdAt: string }, orgName?: string): string {
  const year = new Date(task.createdAt).getFullYear()
  const idPart = task.id.slice(-3).toUpperCase()
  const prefix = orgName
    ? orgName.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()
    : 'REQ'
  return `${prefix}-${year}-${idPart}`
}

/**
 * Get initials from a name (e.g., "John Doe" -> "JD")
 */
