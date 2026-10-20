"use client"

import { cn } from "@/lib/utils"

/** DrawerBody's module-level helpers, moved here unchanged so its sections can read them too. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** One labelled fact in a drawer list. */
export function Fact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span
        className={cn("text-right font-medium tabular-nums", warn ? "text-red-600 dark:text-red-400" : "text-foreground")}>{value}</span>
    </div>
  )
}
