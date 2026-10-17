import type { CalendarItemKind, CalendarLayer } from "@hbcfield/shared/client"

/**
 * One colour per kind of thing, the same on every view and in both themes. Used as a CSS custom
 * property (`--k`) so a single class tints a card, a bar or a dot from it.
 */
export const KIND_COLOR: Record<CalendarItemKind, string> = {
  job: "#3b82f6",
  event: "#8b5cf6",
  reminder: "#8b5cf6",
  crm: "#d946ef",
  shift: "#10b981",
  leave: "#f59e0b",
  // An approved/pending remote day — a day WORKED, drawn beside leave but never as leave.
  remote: "#0ea5e9",
  holiday: "#f43f5e",
  document: "#64748b",
}

export const LAYER_COLOR: Record<CalendarLayer, string> = {
  jobs: KIND_COLOR.job,
  events: KIND_COLOR.event,
  crm: KIND_COLOR.crm,
  shifts: KIND_COLOR.shift,
  leave: KIND_COLOR.leave,
  holidays: KIND_COLOR.holiday,
  documents: KIND_COLOR.document,
}

/** Tinted surface + ring for a kind, readable in light and dark. */
export const tint = ("bg-[color-mix(in_oklab,var(--k)_14%,hsl(var(--card)))] ring-1 ring-inset " +
  "ring-[color-mix(in_oklab,var(--k)_32%,transparent)]")
export const tintText = "text-[color-mix(in_oklab,var(--k)_72%,hsl(var(--foreground)))]"
