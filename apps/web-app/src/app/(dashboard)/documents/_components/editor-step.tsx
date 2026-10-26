"use client"

import type { ReactNode } from "react"
import { Panel } from "@/components/page/page-kit"

/**
 * A numbered step of a document editor (the type editor and the template editor) — one card per step,
 * titled "1 · What you give out" as the Documents board draws it (docs/design/web-redesign/Documents.dc.html).
 */
export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Panel className="px-5 py-[18px]">
      <h2 className="mb-3 text-[15px] font-semibold text-foreground">
        <span className="tabular-nums text-muted-foreground">{n} ·</span> {title}
      </h2>
      {children}
    </Panel>
  )
}
