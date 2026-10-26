"use client"

import { useTranslation } from "react-i18next"
import { Inbox } from "lucide-react"
import { type PortalRequestView } from "@/lib/api"
import { getPriorityConfig } from "@/lib/constants"
import { toneChip, type Tone } from "@/lib/status-tones"

/** A request's step as one of the six tones (lib/status-tones). */
const STATUS_TONE: Record<string, Tone> = {
  NEW: "primary",
  ASSIGNED: "info",
  ACCEPTED: "info",
  IN_PROGRESS: "warning",
  BLOCKED: "danger",
  COMPLETED: "success",
  CLOSED: "neutral",
  CANCELED: "neutral",
}

/** One client request: its priority, reference, client and unit — and "Route it" until it has been routed. */
export function PortalRequestRow({ request: r, onOpen }: { request: PortalRequestView; onOpen: () => void }) {
  const { t } = useTranslation()
  const pending = r.triaged === false
  return (
    <button
      className={"w-full flex items-center gap-4 px-5 py-3.5 hover:bg-accent/30 " + "transition-colors text-left"}
      onClick={onOpen}
    >
      <span
        className={`h-2 w-2 rounded-full shrink-0 ${r.priority ? "" : "bg-muted-foreground"}`}
        style={r.priority ? { backgroundColor: getPriorityConfig(r.priority).hex } : undefined}
        title={r.priority ? getPriorityConfig(r.priority).label : undefined}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          <span className="font-mono">{r.reference}</span>
          {r.customerName ? ` · ${r.customerName}` : ""}
          {r.unitName ? ` · ${r.unitName}` : ""}
          {!pending && r.spaceName ? ` · ${r.spaceName}` : ""}
        </p>
      </div>
      {pending ? (
        <span
          className={
            "inline-flex items-center gap-1 text-[11px] font-semibold rounded-full " +
            "px-2.5 py-1 shrink-0 bg-amber-500/15 text-amber-600 dark:text-amber-400"
          }
        >
          <Inbox className="h-3 w-3" />
          {t("portal.pendingTriage", "Route it")}
        </span>
      ) : (
        <span
          className={
            `text-[11px] font-semibold capitalize rounded-full px-2.5 py-1 shrink-0 ` +
            toneChip(STATUS_TONE[r.status] ?? "neutral")
          }
        >
          {r.status.replace(/_/g, " ").toLowerCase()}
        </span>
      )}
    </button>
  )
}
