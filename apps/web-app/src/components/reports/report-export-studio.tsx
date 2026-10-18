"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { FileText, Printer, X, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/toast"
// The choices only: the renderer (and jsPDF, ~350 kB) loads when the dialog
// first previews or exports — see loadRenderer below.
import {
  PDF_TEMPLATES,
  CUSTOM_PDF_TEMPLATE,
  DEFAULT_CUSTOM_PDF,
  type PdfTemplate,
  type CustomPdfOptions,
} from "@/lib/report-pdf-options";
import { loadRenderer, type ReportExportStudioProps } from "./report-export-studio-shared";
import { TemplateThumb } from "./template-thumb"
import { CustomPdfPanel } from "./custom-pdf-panel"

export function ReportExportStudio({ open, onOpenChange, result, meta, branding, canCustom, defaultName }: ReportExportStudioProps) {
  const { t } = useTranslation()
  const [template, setTemplate] = useState<PdfTemplate>("classic")
  const [custom, setCustom] = useState<CustomPdfOptions>({ ...DEFAULT_CUSTOM_PDF })
  // Double-buffered preview: the new PDF loads into the hidden iframe and is
  // promoted only once it has painted — so switching templates never flashes.
  const [slotA, setSlotA] = useState<string | null>(null)
  const [slotB, setSlotB] = useState<string | null>(null)
  const [front, setFront] = useState<"a" | "b">("a")
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const frontRef = useRef<"a" | "b">("a")
  const pendingRef = useRef<string | null>(null)
  const aRef = useRef<HTMLIFrameElement>(null)
  const bRef = useRef<HTMLIFrameElement>(null)
  const frontUrl = front === "a" ? slotA : slotB
  const hasPreview = !!frontUrl

  const templates = [...PDF_TEMPLATES, ...(canCustom ? [CUSTOM_PDF_TEMPLATE] : [])]
  const accent = template === "custom" ? custom.accent : "#2563EB"
  const custEmpty = template === "custom" && !(custom.table || custom.chart || custom.summary)

  // Live preview — regenerate (debounced) as template/options change, loading
  // into the hidden buffer. Promotion happens in the iframe onLoad handler.
  useEffect(() => {
    if (!open || !result) return
    let cancelled = false
    setBusy(true)
    const handle = setTimeout(async () => {
      try {
        const { renderReportPdfPreview } = await loadRenderer()
        const url = await renderReportPdfPreview(result, meta, branding, template, template === "custom" ? custom : undefined)
        if (cancelled) { URL.revokeObjectURL(url); return }
        pendingRef.current = url
        const hidden = frontRef.current === "a" ? "b" : "a"
        const setter = hidden === "a" ? setSlotA : setSlotB
        setter((old) => { if (old) URL.revokeObjectURL(old); return url })
      } catch { /* preview is best-effort */ } finally { if (!cancelled) setBusy(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(handle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template, custom, result])

  // Once the hidden buffer has painted the new PDF, swap it to the front.
  const promote = (slot: "a" | "b") => {
    const url = slot === "a" ? slotA : slotB
    if (!url || url !== pendingRef.current) return
    pendingRef.current = null
    const prev = frontRef.current
    if (prev === slot) return
    frontRef.current = slot
    setFront(slot)
    const clear = prev === "a" ? setSlotA : setSlotB
    clear((old) => { if (old) URL.revokeObjectURL(old); return null })
  }

  // Free both blobs and reset when the studio closes.
  useEffect(() => {
    if (!open) {
      setSlotA((old) => { if (old) URL.revokeObjectURL(old); return null })
      setSlotB((old) => { if (old) URL.revokeObjectURL(old); return null })
      frontRef.current = "a"; pendingRef.current = null; setFront("a")
    }
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
      const { exportReportPdf } = await loadRenderer()
      await exportReportPdf(result, meta, branding, template, template === "custom" ? custom : undefined)
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to export PDF")
    } finally { setDownloading(false) }
  }
  const print = () => {
    const w = (front === "a" ? aRef : bRef).current?.contentWindow
    try { w?.focus(); w?.print() } catch { if (frontUrl) window.open(frontUrl, "_blank") }
  }
  const setC = (patch: Partial<CustomPdfOptions>) => setCustom((c) => ({ ...c, ...patch }))

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
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9"
            onClick={print}
            disabled={!hasPreview}><Printer className="h-3.5 w-3.5" />{t("reports.print", "Print")}</Button>
          <Button size="sm" className="gap-1.5 h-9" onClick={download} disabled={!result || custEmpty || downloading}>
            {downloading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileText className="h-3.5 w-3.5" />}{t("reports.downloadPdf", "Download PDF")}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => onOpenChange(false)}
            aria-label={t("common.close", "Close")}><X className="h-5 w-5" /></Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[340px_1fr]">
        {/* Left: template gallery + custom options */}
        <div className="border-r border-border overflow-y-auto p-4 space-y-4">
          <div>
            <p
              className={"text-[11px] font-semibold uppercase tracking-wide text-muted-foreground " +
                "mb-2 px-0.5"}>{t("reports.templates", "Templates")}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {templates.map((tpl) => {
                const on = template === tpl.key
                return (
                  <button
                    key={tpl.key}
                    onClick={() => setTemplate(tpl.key)}
                    className={cn(
                      "group text-left rounded-xl border p-2 transition-all",
                      on
                        ? "border-primary ring-2 ring-primary/20 bg-primary/[0.04]"
                        : "border-border hover:border-primary/40 hover:bg-accent/30")}
                  >
                    <div className="rounded-lg bg-slate-50 p-2.5 mb-1.5">
                      <TemplateThumb template={tpl.key} accent={tpl.key === "custom" ? custom.accent : "#2563EB"} />
                    </div>
                    <div className="flex items-center gap-1 px-0.5">
                      <span className="text-xs font-medium text-foreground truncate">{t(`reports.pdfTpl.${tpl.key}.name`, tpl.name)}</span>
                      {tpl.key === "custom" &&
                        <span
                          className={"rounded-full bg-primary/10 text-primary text-[9px] px-1.5 py-0.5 " +
                            "font-semibold shrink-0"}>PRO</span>}
                    </div>
                  </button>
                )
              })}
            </div>
            <p
              className="text-[11px] text-muted-foreground mt-2 px-0.5 leading-snug">{t(
                `reports.pdfTpl.${template}.desc`,
                templates.find((x) => x.key === template)?.description || "")}</p>
          </div>

          {/* Custom options (progressive disclosure) */}
          {template === "custom" && canCustom && (
            <CustomPdfPanel custom={custom} setC={setC} defaultName={defaultName} />
          )}
        </div>

        {/* Right: preview stage — two stacked iframes, crossfaded (no flash) */}
        <div className="relative bg-muted/40 min-h-0">
          <iframe
            ref={aRef}
            title={t("reports.pdfPreview", "PDF preview")}
            src={slotA ? `${slotA}#view=FitH` : undefined}
            onLoad={() => promote("a")}
            className={cn(
              "absolute inset-0 w-full h-full transition-opacity duration-200",
              front === "a" && slotA ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none")}
          />
          <iframe
            ref={bRef}
            title={t("reports.pdfPreview", "PDF preview")}
            src={slotB ? `${slotB}#view=FitH` : undefined}
            onLoad={() => promote("b")}
            className={cn(
              "absolute inset-0 w-full h-full transition-opacity duration-200",
              front === "b" && slotB ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none")}
          />
          {!hasPreview && (
            // Skeleton page while the first preview builds.
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="w-[420px] max-w-[80%] aspect-[1/1.414] rounded-lg bg-white ring-1 ring-border shadow-sm p-6 space-y-3">
                <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                <div className="h-6 w-2/3 rounded bg-muted animate-pulse" />
                <div className="h-2 w-1/2 rounded bg-muted animate-pulse" />
                <div
                  className="grid grid-cols-4 gap-2 pt-2">{Array.from({
                    length: 4
                  }).map((_, i) => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
                <div
                  className="space-y-2 pt-2">{Array.from({
                    length: 6
                  }).map((_, i) => <div key={i} className="h-3 rounded bg-muted animate-pulse" />)}</div>
              </div>
            </div>
          )}
          {busy && hasPreview && (
            <div
              className={"absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-md " +
                "bg-background/90 border border-border px-2.5 py-1.5 text-[11px] " +
                "text-muted-foreground shadow-sm"}>
              <Loader2 className="h-3 w-3 animate-spin" />{t("reports.pdfUpdating", "Updating…")}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
