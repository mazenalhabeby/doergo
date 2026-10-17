"use client"

/* The template editor's form building blocks: a numbered step, a labelled field, a plain select. */

export { Step } from "../../_components/editor-step"

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

export function Select({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={"h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm " +
        "text-slate-900 dark:border-slate-700 dark:bg-slate-900 " +
        "dark:text-slate-100"}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
