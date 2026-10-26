"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, AlertTriangle, Download } from "lucide-react"
import { documentsApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import { EmptyNote } from "@/components/ui/empty-note"
import { Notice } from "@/components/page/page-kit"

/**
 * The draft, rendered by the server into the PDF a member would receive.
 *
 * Rendered SERVER-side on purpose. A second renderer in the browser would draw
 * a document nobody is ever sent — different font metrics, different page
 * breaks — and the one question this pane exists to answer is what the real
 * file looks like.
 *
 * Debounced rather than live: a render is real work at both ends, and a
 * contract is read in pauses, not per keystroke.
 */
export function PdfPreview({ body, title, memberId }: { body: string; title: string; memberId?: string }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!body.trim()) {
      setUrl(null)
      setError(null)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const res = await documentsApi.previewTemplate({ body, title, memberId })
        if (cancelled || !res?.pdf) return

        // base64 → bytes → blob. The PDF is never stored, so there is no URL to
        // presign and nothing to clean up server-side.
        const binary = atob(res.pdf)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))

        setUrl((old) => {
          // Revoke the one being replaced, or every edit leaks a few kilobytes
          // for as long as the tab stays open.
          if (old) URL.revokeObjectURL(old)
          return objectUrl
        })
        setMissing(res.missing)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("documents.templates.previewFailed"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 700)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [body, title, memberId, t])

  // The last render is revoked when the pane goes away, not before — switching
  // back to Text and returning should not have to re-render.
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )

  if (!body.trim()) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <EmptyNote>{t("documents.templates.previewEmpty")}</EmptyNote>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error ? (
        <Notice tone="crit" className="mb-0 items-start">
          <AlertTriangle className="mt-0.5" />
          <p className="text-sm text-foreground">{error}</p>
        </Notice>
      ) : (
        <div className="relative">
          {url && (
            <iframe
              /* Chrome's viewer opens with the thumbnail rail out, which eats
                 half of a pane that is already narrow. */
              src={`${url}#view=FitH&navpanes=0`}
              title={t("documents.templates.preview")}
              className="h-[70vh] w-full rounded-lg border border-border bg-card"
            />
          )}
          {(loading || !url) && (
            <div
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground",
                url ? "absolute inset-0 bg-white/60" : "h-[70vh] border border-border",
              )}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("documents.templates.previewRendering")}
            </div>
          )}
        </div>
      )}

      {/*
        Values the member's record does not have. They print as an em dash here
        and would REFUSE to issue — better named now than discovered on the day
        somebody is waiting for their contract.
      */}
      {missing.length > 0 && !error && (
        <Notice tone="warn" className="mb-0 items-start">
          <AlertTriangle className="mt-0.5" />
          <p className="text-sm text-foreground">
            {t("documents.templates.previewMissing", {
              count: missing.length,
              fields: missing.map((f) => t(`documents.templates.fieldLabels.${f}`, { defaultValue: f })).join(", "),
            })}
          </p>
        </Notice>
      )}

      {url && !error && (
        <a
          href={url}
          download={`${title || t("documents.templates.untitled")}.pdf`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Download className="h-4 w-4" />
          {t("documents.templates.previewDownload")}
        </a>
      )}
    </div>
  )
}
