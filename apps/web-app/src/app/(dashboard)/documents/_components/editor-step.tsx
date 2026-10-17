"use client"

import type { ReactNode } from "react"

/** A numbered step of a document editor (the type editor and the template editor). */
export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={"grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 " +
            "text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900"}>
          {n}
        </span>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      <div className="pl-[34px]">{children}</div>
    </section>
  )
}
