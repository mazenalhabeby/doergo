"use client"

import { personName } from "@hbcfield/shared/client"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ExternalLink, Loader2, Trash2 } from "lucide-react"

import { documentsApi, type DraftDocumentRow } from "@/lib/api"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"

const MONTHS_KEY = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const

/**
 * Work that was uploaded and never released.
 *
 * A batch is staged first and published second, so that thirty payslips become
 * visible in one moment rather than trickling out as they upload. The cost of
 * that design is this state: close the tab between the two steps and the
 * documents are in the system, invisible to the member, and — until this panel
 * existed — invisible to the admin as well.
 *
 * The screen used to say "1 document is staged and not yet published" and stop
 * there. It named the problem and offered nothing: publishing only ever sent the
 * rows of the CURRENT session, so an older draft could not be released, could
 * not be discarded, and could not even be looked at. It simply sat in storage.
 *
 * So: every staged draft, what it is, whose it is, and the two things anybody
 * would want to do with one.
 */
export function StagedDrafts({
  drafts,
  onPublish,
  publishing,
  blockedReason,
  onChanged,
}: {
  drafts: DraftDocumentRow[]
  onPublish: (ids: string[]) => void
  publishing: boolean
  /** Why publishing is refused right now, when it is. */
  blockedReason: string | null
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)

  if (drafts.length === 0) return null

  const period = (d: DraftDocumentRow) => {
    if (d.periodMonth && d.periodYear) {
      return `${t(`documents.months.${MONTHS_KEY[d.periodMonth - 1]}`)} ${d.periodYear}`
    }
    return d.periodYear ? String(d.periodYear) : "—"
  }

  /*
    Opening a draft mints a real download link and RECORDS the open, exactly as
    it would for a published document. That is deliberate: looking at somebody's
    payslip is the event the audit trail is for, and it does not become less so
    because the document has not been released yet.
  */
  const open = async (d: DraftDocumentRow) => {
    setOpening(d.id)
    try {
      const res = await documentsApi.downloadUrl(d.id)
      const url = (res as { url?: string } | null)?.url
      if (!url) throw new Error(t("documents.issue.openFailed", "Could not open this document"))
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e) {
      notify.error((e as Error).message)
    } finally {
      setOpening(null)
    }
  }

  const discard = async (d: DraftDocumentRow) => {
    setBusyId(d.id)
    try {
      await documentsApi.discardDraft(d.id)
      notify.success(t("documents.issue.discarded", "Draft discarded"))
      onChanged()
    } catch (e) {
      notify.error((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mb-5 overflow-hidden rounded-[22px] border border-border bg-card shadow-shell">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="flex gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-shell-warn" />
          <div>
            <p className="text-[15px] font-semibold text-foreground">
              {t("documents.issue.pendingDrafts", { count: drafts.length })}
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {t(
                "documents.issue.pendingDraftsHint",
                "Uploaded but not released — the member cannot see these and has not been told about them.",
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="pill"
            onClick={() => onPublish(drafts.map((d) => d.id))}
            disabled={publishing || !!blockedReason}
            title={blockedReason ?? undefined}
          >
            {publishing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("documents.issue.publishStaged", "Publish these")}
          </Button>
        </div>
      </header>

      {blockedReason && <p className="px-5 pb-2 text-[12px] text-shell-warn">{blockedReason}</p>}

      <div className="divide-y divide-border border-t border-border">
        {drafts.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-foreground">{d.title}</p>
              <p className="truncate text-[12.5px] text-muted-foreground">
                {personName(d.user)} · {d.type.label} · {period(d)}
              </p>
            </div>

            <span className="whitespace-nowrap text-[11.5px] tabular-nums text-muted-foreground">
              {new Date(d.createdAt).toLocaleDateString(dateLocale())}
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => open(d)}
                disabled={opening === d.id}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px]",
                  "font-semibold text-foreground hover:bg-accent",
                )}
              >
                {opening === d.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                {t("documents.issue.openDraft", "Open")}
              </button>
              <button
                type="button"
                onClick={() => discard(d)}
                disabled={busyId === d.id}
                className={
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] " +
                  "font-semibold text-shell-crit hover:bg-shell-chip"
                }
              >
                {busyId === d.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {t("documents.issue.discardDraft", "Discard")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
