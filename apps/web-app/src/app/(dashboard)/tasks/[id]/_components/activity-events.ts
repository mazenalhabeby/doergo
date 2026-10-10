import {
  Clock,
  UserPlus,
  UserMinus,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Paperclip,
  AlertTriangle,
  MapPin,
  FileEdit,
  PauseCircle,
  PenLine,
  Crown,
  CheckSquare,
  type LucideIcon,
} from "lucide-react"

import type { TaskEvent } from "@/lib/api"

/**
 * How a job's history is said — the icon, its colour and the sentence for each
 * event. One place for the task page's Activity panel AND the job report, so
 * the report can never describe an event differently from the page.
 */

const EVENT_CONFIG: Record<
  string,
  { icon: LucideIcon; color: string; labelKey: string }
> = {
  CREATED: { icon: Clock, color: "text-blue-500", labelKey: "tasks.activity.events.CREATED" },
  UPDATED: { icon: FileEdit, color: "text-muted-foreground", labelKey: "tasks.activity.events.UPDATED" },
  ASSIGNED: { icon: UserPlus, color: "text-purple-500", labelKey: "tasks.activity.events.ASSIGNED" },
  UNASSIGNED: { icon: UserMinus, color: "text-orange-500", labelKey: "tasks.activity.events.UNASSIGNED" },
  STATUS_CHANGED: { icon: PlayCircle, color: "text-amber-500", labelKey: "tasks.activity.events.STATUS_CHANGED" },
  EN_ROUTE: { icon: MapPin, color: "text-cyan-500", labelKey: "tasks.activity.events.EN_ROUTE" },
  ARRIVED: { icon: MapPin, color: "text-teal-500", labelKey: "tasks.activity.events.ARRIVED" },
  IN_PROGRESS: { icon: PlayCircle, color: "text-amber-500", labelKey: "tasks.activity.events.IN_PROGRESS" },
  BLOCKED: { icon: AlertTriangle, color: "text-red-500", labelKey: "tasks.activity.events.BLOCKED" },
  COMPLETED: { icon: CheckCircle2, color: "text-green-500", labelKey: "tasks.activity.events.COMPLETED" },
  CANCELED: { icon: XCircle, color: "text-red-500", labelKey: "tasks.activity.events.CANCELED" },
  CLOSED: { icon: CheckCircle2, color: "text-muted-foreground", labelKey: "tasks.activity.events.CLOSED" },
  ATTACHMENT_ADDED: { icon: Paperclip, color: "text-indigo-500", labelKey: "tasks.activity.events.ATTACHMENT_ADDED" },
  ATTACHMENT_REMOVED: { icon: Paperclip, color: "text-red-500", labelKey: "tasks.activity.events.ATTACHMENT_REMOVED" },
  // Stopped at a clock-out, picked back up, and what the worker wrote about it.
  PAUSED: { icon: PauseCircle, color: "text-muted-foreground", labelKey: "tasks.activity.events.PAUSED" },
  RESUMED: { icon: PlayCircle, color: "text-amber-500", labelKey: "tasks.activity.events.RESUMED" },
  HANDOVER_ADDED: { icon: PenLine, color: "text-primary", labelKey: "tasks.activity.events.HANDOVER_ADDED" },
  // A crew on one job (shared tasks/crew.ts): one person's own presence, and the lead.
  CREW_JOINED: { icon: UserPlus, color: "text-green-500", labelKey: "tasks.activity.events.CREW_JOINED" },
  CREW_LEFT: { icon: UserMinus, color: "text-muted-foreground", labelKey: "tasks.activity.events.CREW_LEFT" },
  SELF_BLOCKED: { icon: AlertTriangle, color: "text-amber-500", labelKey: "tasks.activity.events.SELF_BLOCKED" },
  SELF_RESUMED: { icon: PlayCircle, color: "text-green-500", labelKey: "tasks.activity.events.SELF_RESUMED" },
  LEAD_CHANGED: { icon: Crown, color: "text-primary", labelKey: "tasks.activity.events.LEAD_CHANGED" },
  // A task open to a work role (shared tasks/role-pool.ts): opened, offered, taken, handed back.
  OPENED_TO_ROLE: { icon: UserPlus, color: "text-violet-500", labelKey: "tasks.activity.events.OPENED_TO_ROLE" },
  OFFERED: { icon: UserPlus, color: "text-muted-foreground", labelKey: "tasks.activity.events.OFFERED" },
  TAKEN: { icon: UserPlus, color: "text-green-500", labelKey: "tasks.activity.events.TAKEN" },
  RETURNED_TO_ROLE: { icon: UserMinus, color: "text-amber-500", labelKey: "tasks.activity.events.RETURNED_TO_ROLE" },
  // The checklist (shared tasks/checklist.ts): who ticked what, and whose item it became.
  CHECKLIST_ITEM_TOGGLED: { icon: CheckSquare, color: "text-green-500", labelKey: "tasks.activity.events.CHECKLIST_ITEM_TOGGLED" },
  CHECKLIST_ITEM_ASSIGNED: { icon: CheckSquare, color: "text-primary", labelKey: "tasks.activity.events.CHECKLIST_ITEM_ASSIGNED" },
}

export const EXCLUDED_EVENTS = ["COMMENT_ADDED"]

export function getEventConfig(eventType: string) {
  return EVENT_CONFIG[eventType] || EVENT_CONFIG.UPDATED
}

export function getEventDescription(event: Pick<TaskEvent, "eventType" | "metadata">, t: (key: string, options?: Record<string, unknown>) => string): string {
  const metadata = event.metadata as Record<string, unknown> | null

  if (event.eventType === "STATUS_CHANGED" && metadata) {
    const oldStatus = metadata.oldStatus as string | undefined
    const newStatus = metadata.newStatus as string | undefined
    const reason = metadata.reason as string | undefined
    if (oldStatus && newStatus) {
      const desc = `${oldStatus.replace(/_/g, " ")} → ${newStatus.replace(/_/g, " ")}`
      // The office moved it FOR somebody: say so, with why (shared tasks/job-time.ts).
      if (metadata.byOffice) {
        const why = metadata.officeReason ? ` · “${String(metadata.officeReason)}”` : ""
        return `${desc} · ${t("tasks.activity.byOffice")}${why}`
      }
      if (reason && newStatus === "BLOCKED") {
        return `${desc}: ${reason.length > 30 ? reason.slice(0, 30) + "..." : reason}`
      }
      return desc
    }
  }

  // A crew on one job: say what happened in the person's terms, with the reason the history keeps.
  if (metadata && event.eventType === "CREW_JOINED") {
    if (metadata.byUserId) return `${t("tasks.activity.crew.addedByOffice")}${metadata.reason ? ` · “${String(metadata.reason)}”` : ""}`
    return metadata.viaLeaderAt ? t("tasks.activity.crew.joinedWithLeader") : t("tasks.activity.events.CREW_JOINED")
  }
  if (metadata && event.eventType === "CREW_LEFT") {
    const why = String(metadata.why ?? "SELF")
    return t(`tasks.activity.crew.left.${["CLOCK_OUT", "OTHER_JOB", "OFFICE"].includes(why) ? why : "SELF"}`)
  }
  if (metadata && event.eventType === "SELF_BLOCKED" && metadata.reason) {
    const reason = String(metadata.reason)
    return `${t("tasks.activity.events.SELF_BLOCKED")}: ${reason.length > 40 ? reason.slice(0, 40) + "…" : reason}`
  }
  if (metadata && event.eventType === "CHECKLIST_ITEM_TOGGLED" && metadata.text) {
    return t(metadata.isCompleted ? "tasks.activity.checklist.ticked" : "tasks.activity.checklist.unticked", { text: String(metadata.text) })
  }
  if (metadata && event.eventType === "CHECKLIST_ITEM_ASSIGNED" && metadata.text) {
    return metadata.toName
      ? t("tasks.activity.checklist.owner", { text: String(metadata.text), name: String(metadata.toName) })
      : t("tasks.activity.checklist.noOwner", { text: String(metadata.text) })
  }
  if (metadata && event.eventType === "OPENED_TO_ROLE") {
    return t("tasks.activity.role.opened", { role: String(metadata.roleName ?? ""), count: Number(metadata.spots ?? 1) })
  }
  if (metadata && event.eventType === "OFFERED") {
    const n = Array.isArray(metadata.userIds) ? metadata.userIds.length : 0
    return t(Number(metadata.wave) >= 1 ? "tasks.activity.role.offeredWide" : "tasks.activity.role.offeredFree", { count: n })
  }
  if (metadata && event.eventType === "TAKEN") {
    const name = String(metadata.workerName ?? "")
    return typeof metadata.waitedMinutes === "number"
      ? t("tasks.activity.role.takenAfter", { name, count: metadata.waitedMinutes })
      : t("tasks.activity.role.taken", { name })
  }
  if (metadata && event.eventType === "RETURNED_TO_ROLE") {
    const base = t("tasks.activity.role.returned", { role: String(metadata.roleName ?? "") })
    return metadata.reason ? `${base} · “${String(metadata.reason)}”` : base
  }
  if (metadata && event.eventType === "LEAD_CHANGED") {
    const name = String(metadata.toName ?? "")
    return t(metadata.scope === "TODAY" ? "tasks.activity.crew.leadToday" : "tasks.activity.crew.leadForGood", { name })
  }

  if (event.eventType === "ASSIGNED" && metadata) {
    const workerName = metadata.workerName as string | undefined
    if (workerName) return t("tasks.activity.assignedTo", { name: workerName })
  }

  if (event.eventType === "UPDATED" && metadata) {
    const changes = metadata.changes as Record<string, unknown> | undefined
    if (changes) {
      const fields = Object.keys(changes).filter(k => k !== "userId" && k !== "userRole" && k !== "organizationId")
      if (fields.length > 0) {
        return t("tasks.activity.updatedFields", { fields: fields.join(", ") })
      }
    }
  }

  return t(getEventConfig(event.eventType).labelKey)
}

