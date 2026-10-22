"use client"

import dynamic from "next/dynamic"
import { TabsTrigger } from "@/components/ui/tabs"
import type { Tone } from "@/lib/status-tones"
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state"

/** PortalDetailPage's module-level helpers, moved here unchanged so its sections can read them too. */
// Lazy (audit P-C1). Both are dialogs that render on a click; the CustomerForm
// import also drags in the whole customers-tab module.
export const ApartmentDialog = dynamic(
  () => import("../../../_components/apartment-dialog").then((m) => m.ApartmentDialog),
  { ssr: false },
)

export const CustomerForm = dynamic(() => import("../../../_components/customers-tab").then((m) => m.CustomerForm), {
  ssr: false,
})

export const COLORS = ["emerald", "blue", "amber", "purple", "cyan", "indigo", "red", "orange", "slate"]

/** A request's step as one of the six tones (lib/status-tones). */
export const STATUS_TONE: Record<string, Tone> = {
  NEW: "primary",
  ASSIGNED: "info",
  ACCEPTED: "info",
  IN_PROGRESS: "warning",
  BLOCKED: "danger",
  COMPLETED: "success",
  CLOSED: "neutral",
  CANCELED: "neutral",
}

export function TabTrigger({ value, label, count }: { value: string; label: string; count: number }) {
  return (
    <TabsTrigger value={value} className="rounded-md data-[state=active]:shadow-sm">
      {label}
      {count > 0 && (
        <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-[11px] font-semibold tabular-nums">
          {count}
        </span>
      )}
    </TabsTrigger>
  )
}

export function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card overflow-hidden">{children}</div>
}

export function EmptyState({
  icon,
  title,
  hint,
  cta,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  cta?: React.ReactNode
}) {
  // The shared empty state, a little inset because it sits inside a panel.
  return <SharedEmptyState icon={icon} title={title} description={hint} action={cta} className="m-4" />
}

export function Loading() {
  return <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
}
