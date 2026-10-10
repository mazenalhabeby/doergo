"use client"

import { FileText, type Upload } from "lucide-react"
import { cn } from "@/lib/utils"

/* The small building blocks of the type editor: a numbered step, a labelled
   field, a choice card, a switch row, and the "locked after creation" note. */

export { Step } from "../../_components/editor-step"

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  )
}

export function Choice({
  selected, disabled, onClick, Icon, title, hint,
}: {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  Icon: typeof Upload
  title: string
  hint: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        selected
          ? "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-800",
      )}
    >
      <div className="mb-0.5 flex items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", selected ? "text-blue-600 dark:text-blue-400" : "text-slate-400")} />
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
      </div>
      <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{hint}</p>
    </button>
  )
}

export function Toggle({
  checked, onChange, title, hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  hint: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-slate-300 dark:border-slate-800"
    >
      <span
        className={cn(
          "mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors",
          checked ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700",
        )}
      >
        <span className={cn(
          "block h-4 w-4 rounded-full bg-white transition-transform",
          checked && "translate-x-4",
        )} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
        <span className="block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
    </button>
  )
}

export function Locked({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  )
}
