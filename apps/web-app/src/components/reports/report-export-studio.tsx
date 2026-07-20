"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { FileText, Printer, X, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/toast"
import {
  exportReportPdf, renderReportPdfPreview, PDF_TEMPLATES, CUSTOM_PDF_TEMPLATE,
  type ReportBranding, type PdfTemplate, type CustomPdfOptions, type ReportPdfMeta,
} from "@/lib/report-pdf"
import type { ReportResult } from "@/lib/api"

const ACCENTS = ["#2563EB", "#334155", "#059669", "#7C3AED", "#E11D48", "#D97706"]

/** Tiny CSS mock of each template layout — a Canva-style visual thumbnail. */
function TemplateThumb({ template, accent }: { template: PdfTemplate; accent: string }) {
  const bar = (w: string, c = "bg-slate-200") => <div className={cn("h-1 rounded-full", c)} style={{ width: w }} />
  const card = <div className="flex-1 rounded-sm bg-slate-100 border-l-2" style={{ borderColor: accent }} />
  const rows = (n: number) => (
    <div className="space-y-[3px]">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-[3px] rounded-full bg-slate-200" />)}</div>
  )
  const wrap = (children: React.ReactNode, landscape = false) => (
    <div className={cn("mx-auto bg-white rounded-sm ring-1 ring-slate-200 shadow-sm p-2 space-y-1.5 overflow-hidden", landscape ? "w-full aspect-[1.414/1]" : "aspect-[1/1.414] w-[62%]")}>{children}</div>
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
      {["70%", "45%", "88%", "30%"].map((w, i) => <div key={i} className="h-[3px] rounded-full" style={{ width: w, backgroundColor: accent }} />)}
    </div>
  )
  const cards = (
    <div className="flex gap-1">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-4 flex-1 rounded-sm bg-slate-100 border-l-2" style={{ borderColor: accent }} />)}</div>
  )

  switch (template) {
    case "executive":
      return wrap(<>{header()}<div className="pt-0.5">{bar("55%", "bg-slate-300")}</div>{cards}{chart}{rows(3)}</>)
    case "data":
      return wrap(<>{header()}<div className="pt-0.5">{bar("55%", "bg-slate-300")}</div>{rows(8)}</>, true)
    case "presentation":
      return wrap(<>{header(true)}{cards}{chart}{rows(2)}</>)
    case "custom":
      return wrap(<>{header()}<div className="pt-0.5">{bar("55%", "bg-slate-300")}</div><div className="flex gap-1">{card}{card}</div>{chart}{rows(3)}</>)
    case "classic":
    default:
      return wrap(<>{header()}<div className="pt-0.5">{bar("55%", "bg-slate-300")}</div>{chart}{rows(5)}</>)
  }
}

export interface ReportExportStudioProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  result: ReportResult | null
  meta: ReportPdfMeta
  branding: ReportBranding
  canCustom: boolean
  defaultName?: string
}

export function ReportExportStudio({ open, onOpenChange, result, meta, branding, canCustom, defaultName }: ReportExportStudioProps) {
  const { t } = useTranslation()
  const [template, setTemplate] = useState<PdfTemplate>("classic")
  const [custom, setCustom] = useState<CustomPdfOptions>({ accent: "#2563EB", orientation: "portrait", logo: true, summary: true, chart: true, table: true, heading: "", note: "" })
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const templates = [...PDF_TEMPLATES, ...(canCustom ? [CUSTOM_PDF_TEMPLATE] : [])]
  const accent = template === "custom" ? custom.accent : "#2563EB"
  const custEmpty = template === "custom" && !(custom.table || custom.chart || custom.summary)

  // Live preview — regenerate (debounced) as template/options change.
  useEffect(() => {
    if (!open || !result) return
    let cancelled = false
    setBusy(true)
    const handle = setTimeout(async () => {
      try {
        const url = await renderReportPdfPreview(result, meta, branding, template, template === "custom" ? custom : undefined)
        if (cancelled) { URL.revokeObjectURL(url); return }
        setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return url })
      } catch { /* preview is best-effort */ } finally { if (!cancelled) setBusy(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(handle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template, custom, result])

  // Free the preview blob when the studio closes.
  useEffect(() => {
    if (!open) setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return null })
  }, [open])

  // Esc closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  if (!open) return null

  const download = async () => {
    if (!result) return
    setDownloading(true)
    try {
      await exportReportPdf(result, meta, branding, template, template === "custom" ? custom : undefined)
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to export PDF")
    } finally { setDownloading(false) }
  }
  const print = () => {
    const w = iframeRef.current?.contentWindow
    try { w?.focus(); w?.print() } catch { if (previewUrl) window.open(previewUrl, "_blank") }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground leading-tight">{t("reports.exportStudioTitle", "Export report")}</p>
            <p className="text-[11px] text-muted-foreground leading-tight">{meta.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={print} disabled={!previewUrl}><Printer className="h-3.5 w-3.5" />{t("reports.print", "Print")}</Button>
          <Button size="sm" className="gap-1.5 h-9" onClick={download} disabled={!result || custEmpty || downloading}>
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}{t("reports.downloadPdf", "Download PDF")}
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onOpenChange(false)} aria-label={t("common.close", "Close")}><X className="h-5 w-5" /></Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[340px_1fr]">
        {/* Left: template gallery + custom options */}
        <div className="border-r border-border overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-0.5">{t("reports.templates", "Templates")}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {templates.map((tpl) => {
                const on = template === tpl.key
                return (
                  <button
                    key={tpl.key}
                    onClick={() => setTemplate(tpl.key)}
                    className={cn("group text-left rounded-xl border p-2 transition-all", on ? "border-primary ring-2 ring-primary/20 bg-primary/[0.04]" : "border-border hover:border-primary/40 hover:bg-accent/30")}
                  >
                    <div className="rounded-lg bg-slate-50 p-2.5 mb-1.5">
                      <TemplateThumb template={tpl.key} accent={tpl.key === "custom" ? custom.accent : "#2563EB"} />
                    </div>
                    <div className="flex items-center gap-1 px-0.5">
                      <span className="text-xs font-medium text-foreground truncate">{t(`reports.pdfTpl.${tpl.key}.name`, tpl.name)}</span>
                      {tpl.key === "custom" && <span className="rounded-full bg-primary/10 text-primary text-[9px] px-1.5 py-0.5 font-semibold shrink-0">PRO</span>}
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 px-0.5 leading-snug">{t(`reports.pdfTpl.${template}.desc`, templates.find((x) => x.key === template)?.description || "")}</p>
          </div>

          {/* Custom options (progressive disclosure) */}
          {template === "custom" && canCustom && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs">{t("reports.pdfAccent", "Accent color")}</Label>
                <div className="flex items-center gap-1.5">
                  {ACCENTS.map((hex) => (
                    <button key={hex} onClick={() => setCustom((c) => ({ ...c, accent: hex }))} className={cn("h-6 w-6 rounded-full border-2 transition-transform hover:scale-110", custom.accent === hex ? "border-foreground" : "border-transparent")} style={{ backgroundColor: hex }} aria-label={hex} />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs">{t("reports.pdfOrientation", "Orientation")}</Label>
                <div className="flex gap-1">
                  {(["portrait", "landscape"] as const).map((o) => (
                    <button key={o} onClick={() => setCustom((c) => ({ ...c, orientation: o }))} className={cn("rounded-lg border px-2.5 py-1 text-xs", custom.orientation === o ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{t(`reports.pdf_${o}`, o)}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-0.5">
                {([["logo", "Company logo"], ["summary", "KPI summary"], ["chart", "Chart"], ["table", "Data table"]] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs">{t(`reports.pdfInc_${key}`, label)}</Label>
                    <Switch checked={custom[key]} onCheckedChange={(v) => setCustom((c) => ({ ...c, [key]: v }))} />
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("reports.pdfHeading", "Custom heading (optional)")}</Label>
                <Input value={custom.heading} onChange={(e) => setCustom((c) => ({ ...c, heading: e.target.value }))} placeholder={defaultName} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("reports.pdfNote", "Note / disclaimer (optional)")}</Label>
                <Input value={custom.note} onChange={(e) => setCustom((c) => ({ ...c, note: e.target.value }))} placeholder={t("reports.pdfNotePlaceholder", "e.g. Confidential — internal use only")} className="h-9" />
              </div>
            </div>
          )}
        </div>

        {/* Right: preview stage */}
        <div className="relative bg-muted/40 min-h-0">
          {previewUrl ? (
            <iframe ref={iframeRef} key={template} title={t("reports.pdfPreview", "PDF preview")} src={`${previewUrl}#view=FitH`} className="w-full h-full" />
          ) : (
            // Skeleton page while the first preview builds.
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[420px] max-w-[80%] aspect-[1/1.414] rounded-lg bg-white ring-1 ring-border shadow-sm p-6 space-y-3">
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                <div className="h-6 w-2/3 rounded bg-muted animate-pulse" />
                <div className="h-2 w-1/2 rounded bg-muted animate-pulse" />
                <div className="grid grid-cols-4 gap-2 pt-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
                <div className="space-y-2 pt-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-3 rounded bg-muted animate-pulse" />)}</div>
              </div>
            </div>
          )}
          {busy && previewUrl && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md bg-background/90 border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
              <Loader2 className="h-3 w-3 animate-spin" />{t("reports.pdfUpdating", "Updating…")}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
