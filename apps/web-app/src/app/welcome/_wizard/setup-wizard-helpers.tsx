"use client"

import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { AREAS } from "@/lib/setup"
import { WizardIcon } from "./wizard-icons"

/* ---------------- small presentational helpers ---------------- */

export function Hero({ icon, green }: { icon: string; green?: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto mb-[18px] grid size-[72px] place-items-center rounded-[20px] text-white",
        green
          ? "bg-gradient-to-br from-green-600 to-green-500 shadow-[0_12px_28px_rgba(22,163,74,.28)]"
          : "bg-gradient-to-br from-primary to-blue-500 shadow-[0_12px_28px_rgba(37,99,235,.30)]",
      )}
    >
      <WizardIcon name={icon} className="size-[34px]" />
    </div>
  )
}

export function Kicker({ icon, text }: { icon: string; text: string }) {
  return (
    <span
      className={
        "mb-4 inline-flex items-center gap-1.5 rounded-full border " +
        "border-primary/15 bg-primary/5 px-3 py-1.5 text-[12px] font-bold " +
        "tracking-wide text-primary"
      }
    >
      <WizardIcon name={icon} className="size-3.5" /> {text}
    </span>
  )
}

export function ChipLabel({ text }: { text: string }) {
  return (
    <div className="mb-2.5 mt-4 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{text}</div>
  )
}

export function Chip({ icon, label, muted }: { icon: string; label: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[9px] border px-3 py-[7px] text-[13px] font-semibold",
        muted ? "border-border bg-slate-50 text-muted-foreground" : "border-primary/15 bg-primary/5 text-primary",
      )}
    >
      <WizardIcon name={icon} className="size-[15px]" /> {label}
    </span>
  )
}

export function Divider({ text }: { text: string }) {
  return (
    <div className="relative mx-auto my-5 max-w-[520px] text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
      <span className="relative z-10 bg-card px-3">{text}</span>
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-border" />
    </div>
  )
}

export function BuildRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div
      className={cn(
        "mb-2.5 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm transition-opacity duration-300",
        active ? "opacity-100" : "opacity-40",
      )}
    >
      {done ? (
        <span className="grid size-[26px] place-items-center rounded-full bg-green-600 text-white">
          <WizardIcon name="check" className="size-[15px]" />
        </span>
      ) : (
        <Loader2 className="size-[26px] animate-spin text-primary" />
      )}
      <span className="text-[14.5px] font-semibold">{label}</span>
    </div>
  )
}

export function DoneRow({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm">
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary/5 text-primary">
        <WizardIcon name={icon} className="size-[19px]" />
      </span>
      <div>
        <div className="text-[14.5px] font-bold">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{detail}</div>
      </div>
    </div>
  )
}

/* ---------------- pure helpers ---------------- */

export function iconForArea(key: string): string {
  return AREAS[key]?.icon ?? "clipboard"
}
