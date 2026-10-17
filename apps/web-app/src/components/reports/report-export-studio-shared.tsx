"use client"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { type ReportBranding } from "@/lib/report-pdf-options"
import type { ReportPdfMeta } from "@/lib/report-pdf"
import type { ReportResult } from "@/lib/api"

/** What the components of report-export-studio.tsx share (moved here unchanged). */
export const loadRenderer = () => import("@/lib/report-pdf")

export const ACCENTS = ["#2563EB", "#334155", "#059669", "#7C3AED", "#E11D48", "#D97706"]

// Module-scope so they keep a stable identity across renders (defining these
// inside the component would remount the inputs on every keystroke).
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-muted/70 p-0.5">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={cn("flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors", value === o.v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-border p-3 space-y-2.5">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
    {children}
  </div>
)

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">{label}</Label>{children}</div>
)

export interface ReportExportStudioProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  result: ReportResult | null
  meta: ReportPdfMeta
  branding: ReportBranding
  canCustom: boolean
  defaultName?: string
}
