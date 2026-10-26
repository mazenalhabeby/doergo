import type { CalendarItemKind, CalendarLayer } from "@hbcfield/shared/client"

/**
 * One colour per kind of thing, the same on every view and in both themes. Used as a CSS custom
 * property (`--k`) so a single class tints a card, a bar or a dot from it. The hues follow the Calendar board:
 * jobs green, appointments blue, reminders violet, client follow-ups rose, leave teal, holidays amber, expiries red.
 */
export const KIND_COLOR: Record<CalendarItemKind, string> = {
  job: "#16a34a",
  event: "#3b6fd8",
  reminder: "#7c5cd6",
  crm: "#e0607a",
  shift: "#0b8168",
  leave: "#0f9488",
  // An approved/pending remote day — a day WORKED, drawn beside leave but never as leave.
  remote: "#0ea5e9",
  holiday: "#c27a12",
  document: "#c0392b",
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
export const tint =
  "bg-[color-mix(in_oklab,var(--k)_16%,hsl(var(--card)))] ring-1 ring-inset " +
  "ring-[color-mix(in_oklab,var(--k)_22%,transparent)]"
export const tintText = "text-[color-mix(in_oklab,var(--k)_72%,hsl(var(--foreground)))]"
