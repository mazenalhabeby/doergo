"use client"

import dynamic from "next/dynamic"
import { TabsTrigger } from "@/components/ui/tabs"

/** PortalDetailPage's module-level helpers, moved here unchanged so its sections can read them too. */
// Lazy (audit P-C1). Both are dialogs that render on a click; the CustomerForm
// import also drags in the whole customers-tab module.
export const ApartmentDialog = dynamic(() => import("../../_components/apartment-dialog").then((m) => m.ApartmentDialog), { ssr: false })

export const CustomerForm = dynamic(() => import("../../_components/customers-tab").then((m) => m.CustomerForm), { ssr: false })

export const COLORS = ["emerald", "blue", "amber", "purple", "cyan", "indigo", "red", "orange", "slate"]

export const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-500/10 text-blue-600 dark:text-blue-400", ASSIGNED: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  ACCEPTED: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", IN_PROGRESS: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  BLOCKED: "bg-red-500/10 text-red-600 dark:text-red-400", COMPLETED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  CLOSED: "bg-slate-500/10 text-slate-500 dark:text-slate-400", CANCELED: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
}

export function TabTrigger({ value, label, count }: { value: string; label: string; count: number }) {
  return (
    <TabsTrigger value={value} className="rounded-md data-[state=active]:shadow-sm">
      {label}
      {count > 0 && <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-[11px] font-semibold tabular-nums">{count}</span>}
    </TabsTrigger>
  )
}

export function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card overflow-hidden">{children}</div>
}

export function EmptyState({ icon, title, hint, cta }: { icon: React.ReactNode; title: string; hint: string; cta?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">{icon}</span>
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{hint}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  )
}

export function Loading() { return <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div> }
