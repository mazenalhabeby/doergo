import { StickyNote, PhoneCall, Mails, Users, Clock } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { TFunction } from "i18next"

import { type CustomerActivity, type Task } from "@/lib/api"
import { CUSTOMER_STAGES } from "@hbcfield/shared/client"
import { dateLocale } from "@/lib/format-date"

// stage tone → dot color
const STAGE_DOT: Record<string, string> = {
  slate: "bg-slate-400", blue: "bg-blue-500", violet: "bg-violet-500", green: "bg-emerald-500", gray: "bg-gray-400",
}
export function stageDot(key: string) {
  return STAGE_DOT[CUSTOMER_STAGES.find((s) => s.key === key)?.tone ?? "slate"] ?? "bg-slate-400"
}

// ── helpers ───────────────────────────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600", "from-emerald-500 to-teal-600", "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600", "from-rose-500 to-pink-600", "from-cyan-500 to-sky-600",
]
export function gradientFor(name: string) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
}
export function relTime(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(dateLocale(), { month: "short", day: "numeric" })
}
export const dayKey = (iso: string) => { const d = new Date(iso); d.setHours(0, 0, 0, 0); return d.getTime() }
export function dayLabel(iso: string, t: TFunction) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = (today.getTime() - dayKey(iso)) / 86400000
  if (diff === 0) return t("customers.today", "Today")
  if (diff === 1) return t("customers.yesterday", "Yesterday")
  return new Date(iso).toLocaleDateString(dateLocale(), { weekday: "long", month: "short", day: "numeric" })
}
export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(dateLocale(), { dateStyle: "medium" }) : "")
export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString(dateLocale(), { dateStyle: "medium", timeStyle: "short" }) : "")

export const COMPOSER = [
  { type: "NOTE", label: "Note", icon: StickyNote },
  { type: "REMINDER", label: "Reminder", icon: Clock },
] as const

// What a reminder is for (its "reason"/channel). Meetings are real work → a Task.
export const REMINDER_KINDS = [
  { key: "CALL", label: "Call", icon: PhoneCall },
  { key: "EMAIL", label: "Email", icon: Mails },
  { key: "OTHER", label: "Other", icon: StickyNote },
] as const

export const REPEAT_OPTIONS: { v: string; label: string }[] = [
  { v: "NONE", label: "Does not repeat" },
  { v: "DAILY", label: "Daily" },
  { v: "WEEKLY", label: "Weekly" },
  { v: "MONTHLY", label: "Monthly" },
]

/**
 * One row of the customer feed.
 *
 * The feed mixes two sources — activity records and this customer's tasks — so
 * a task is wrapped as an activity-shaped row with the task attached. That
 * wrapping used to be `as any` twice over, which meant the sort and the
 * renderer below were both reading fields nothing checked.
 */
export type FeedItem = CustomerActivity | {
  id: string
  type: "TASK"
  createdAt: string
  task: Task
}

// Dynamic lead time — alert this many minutes before the due time.
export const LEAD_OPTIONS: { v: number; label: string }[] = [
  { v: 0, label: "At time" },
  { v: 5, label: "5 min before" },
  { v: 15, label: "15 min before" },
  { v: 30, label: "30 min before" },
  { v: 60, label: "1 hour before" },
  { v: 180, label: "3 hours before" },
  { v: 1440, label: "1 day before" },
  { v: 2880, label: "2 days before" },
  { v: 10080, label: "1 week before" },
]
export const REMINDER_KIND_META: Record<string, { label: string; icon: LucideIcon }> = {
  CALL: { label: "Call", icon: PhoneCall },
  EMAIL: { label: "Email", icon: Mails },
  MEETING: { label: "Meeting", icon: Users },
  OTHER: { label: "Follow-up", icon: StickyNote },
}
export function leadLabel(min?: number | null) {
  if (!min) return null
  return LEAD_OPTIONS.find((o) => o.v === min)?.label ?? `${min} min before`
}
