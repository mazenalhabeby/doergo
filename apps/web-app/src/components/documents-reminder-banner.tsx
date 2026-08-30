"use client"

import Link from "next/link"
import { AlertCircle, ChevronRight, Clock, FileUp } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { useMyDocumentRequirements } from "@/hooks/use-document-requirements"

/**
 * "You still owe us a document", said once.
 *
 * ONE of these, on the dashboard, plus a count on the navigation item. Not a
 * banner on every page: people learn the shape of a thing that is always there
 * and read past it, so the day it finally matters it is invisible — and until
 * then it has taken a strip off the top of screens with nothing to do with
 * documents.
 *
 * Renders nothing when there is nothing outstanding, which is the normal case,
 * so the dashboard is unchanged for everybody who is up to date. No dismiss
 * control on purpose: dismissing either hides a real obligation or teaches
 * people the reminder is optional, and there is already a way to make it go
 * away — supply the document.
 */
export function DocumentsReminderBanner({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { actionable, expiringSoon, blocksWork, count } = useMyDocumentRequirements()

  if (actionable.length === 0 && expiringSoon.length === 0) return null

  const urgent = actionable.length > 0
  const showing = urgent ? actionable : expiringSoon
  const Icon = blocksWork ? AlertCircle : urgent ? FileUp : Clock

  return (
    <Link
      href="/my/documents"
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50",
        className,
      )}
    >
      {/* The tone lives in the icon, not in the whole card. A full-bleed amber
          panel on a dashboard is the visual weight of an outage notice, and
          this is a piece of admin. */}
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          blocksWork
            ? "bg-red-500/10 text-red-600 dark:text-red-400"
            : urgent
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {urgent
            ? t("documents.reminder.needed", { count })
            : t("documents.reminder.expiring", { count: expiringSoon.length })}
        </p>
        {/* Names them. "2 documents" makes somebody open the screen to find out
            which — a click the sentence could have saved them. */}
        <p
          className={cn(
            "truncate text-xs",
            blocksWork ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
          )}
        >
          {blocksWork
            ? t("documents.reminder.blocking")
            : showing.map((r) => r.label).join(" · ")}
        </p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
