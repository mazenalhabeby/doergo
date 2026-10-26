"use client"

// Color per event type — labels are translated via t("auditLog.events.<TYPE>").
/**
 * A one-line summary of a log entry's metadata.
 *
 * The column is free-form JSON written by every mutating route, so the fields
 * are read as unknown and coerced for display — reading `.email` straight into
 * JSX renders `{}` for anything that is not already a string.
 */
export function auditDetail(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return ""
  const m = metadata as {
    email?: unknown
    reason?: unknown
    method?: unknown
    path?: unknown
    title?: unknown
    member?: unknown
  }
  // A document action names the document and whose it was — after a delete,
  // this line is the only place either survives.
  if (typeof m.title === "string" && m.title) {
    return typeof m.member === "string" && m.member ? `${m.title} · ${m.member}` : m.title
  }
  if (typeof m.email === "string" && m.email) return m.email
  if (typeof m.reason === "string" && m.reason) return m.reason
  if (typeof m.method === "string" && typeof m.path === "string") return `${m.method} ${m.path}`
  return ""
}

export const EVENT_COLORS: Record<string, string> = {
  USER_LOGIN: "text-green-600",
  USER_LOGOUT: "text-muted-foreground",
  USER_LOGIN_FAILED: "text-red-600",
  USER_CREATED: "text-shell-accent",
  USER_UPDATED: "text-shell-accent",
  USER_DELETED: "text-red-600",
  TASK_CREATED: "text-shell-accent",
  TASK_ASSIGNED: "text-purple-600",
  TASK_STATUS_CHANGED: "text-amber-600",
  TASK_COMPLETED: "text-green-600",
  TASK_DELETED: "text-red-600",
  TASK_TYPE_CREATED: "text-shell-accent",
  TASK_TYPE_DELETED: "text-red-600",
  CUSTOM_FIELD_CREATED: "text-shell-accent",
  CUSTOM_FIELD_DELETED: "text-red-600",
  MEMBER_ROLE_CHANGED: "text-amber-600",
  MEMBER_REMOVED: "text-red-600",
  ORG_SETTINGS_UPDATED: "text-amber-600",
  ORG_JOIN_CODE_REGENERATED: "text-amber-600",
  INVITATION_CREATED: "text-shell-accent",
  INVITATION_REVOKED: "text-red-600",
  DOCUMENT_DELETED: "text-red-600",
  DOCUMENT_VISIBILITY_CHANGED: "text-amber-600",
  DOCUMENT_REPLACED: "text-purple-600",
  INVITATION_ACCEPTED: "text-green-600",
  JOIN_REQUEST_APPROVED: "text-green-600",
  JOIN_REQUEST_REJECTED: "text-red-600",
  SPACE_CREATED: "text-shell-accent",
  SPACE_DELETED: "text-red-600",
  RECURRING_CREATED: "text-shell-accent",
  RECURRING_DELETED: "text-red-600",
  RECURRING_GENERATED: "text-purple-600",
  TECHNICIAN_CREATED: "text-shell-accent",
  TECHNICIAN_DEACTIVATED: "text-red-600",
  CLOCK_IN: "text-green-600",
  CLOCK_OUT: "text-muted-foreground",
  GEOFENCE_VIOLATION: "text-red-600",
}

export const EVENT_TYPES = Object.keys(EVENT_COLORS)
