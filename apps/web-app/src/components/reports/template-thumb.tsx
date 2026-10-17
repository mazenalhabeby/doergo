"use client"

import { cn } from "@/lib/utils"
import { type PdfTemplate } from "@/lib/report-pdf-options"

/** TemplateThumb, moved here unchanged out of report-export-studio.tsx. */
/** Tiny CSS mock of each template layout — a Canva-style visual thumbnail. */
export function TemplateThumb({ template, accent }: { template: PdfTemplate; accent: string }) {
  const bar = (w: string, c = "bg-slate-200") => <div className={cn("h-1 rounded-full", c)} style={{ width: w }} />
  const card = <div className="flex-1 rounded-sm bg-slate-100 border-l-2" style={{ borderColor: accent }} />
  const rows = (n: number) => (
    <div
      className="space-y-[3px]">{Array.from({
        length: n
      }).map((_, i) => <div key={i} className="h-[3px] rounded-full bg-slate-200" />)}</div>
  )
  const wrap = (children: React.ReactNode, landscape = false) => (
    <div
      className={cn(
        ("mx-auto bg-white rounded-sm ring-1 ring-slate-200 shadow-sm p-2 " + "space-y-1.5 overflow-hidden"),
        landscape ? "w-full aspect-[1.414/1]" : "aspect-[1/1.414] w-[62%]")}>{children}</div>
  )
  const header = (band = false) =>
    band ? (
      <div className="-mx-2 -mt-2 mb-1 px-2 py-1.5 flex items-center gap-1" style={{ backgroundColor: accent }}>
        <div className="h-2 w-2 rounded-sm bg-white/80" /><div className="h-1 w-8 rounded-full bg-white/80" />
      </div>
    ) : (
      <div className="flex items-center gap-1 pb-1 border-b" style={{ borderColor: accent }}>
        <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: accent }} /><div className="h-1 w-8 rounded-full bg-slate-300" />
      </div>
    )
  const chart = (
    <div className="space-y-[3px]">
      {[
        "70%",
        "45%",
        "88%",
        "30%"].map((w, i) => <div key={i} className="h-[3px] rounded-full" style={{ width: w, backgroundColor: accent }} />)}
    </div>
  )
  const cards = (
    <div
      className="flex gap-1">{Array.from({
        length: 4
      }).map((_, i) => <div key={i} className="h-4 flex-1 rounded-sm bg-slate-100 border-l-2" style={{ borderColor: accent }} />)}</div>
  )

  switch (template) {
    case "executive":
      return wrap(<>{header()}<div className="pt-0.5">{bar("55%", "bg-slate-300")}</div>{cards}{chart}{rows(3)}</>)
    case "data":
      return wrap(<>{header()}<div className="pt-0.5">{bar("55%", "bg-slate-300")}</div>{rows(8)}</>, true)
    case "presentation":
      return wrap(<>{header(true)}{cards}{chart}{rows(2)}</>)
    case "custom":
      return wrap(
        <>{header()}<div
          className="pt-0.5">{bar("55%", "bg-slate-300")}</div><div className="flex gap-1">{card}{card}</div>{chart}{rows(3)}</>)
    case "classic":
    default:
      return wrap(<>{header()}<div className="pt-0.5">{bar("55%", "bg-slate-300")}</div>{chart}{rows(5)}</>)
  }
}
