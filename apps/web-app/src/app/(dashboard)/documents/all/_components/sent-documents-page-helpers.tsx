"use client"

import { useTranslation } from "react-i18next"
import { PenLine, MailOpen, CheckCircle2, FileText } from "lucide-react"
import { type IssuedRow, type DocumentChain } from "@/lib/api"
import { cn } from "@/lib/utils"
import { type Tab } from "../_hooks/use-sent-documents-page"

/** SentDocumentsPage's module-level helpers, moved here unchanged so its sections can read them too. */
export const TABS: { key: Tab; icon: typeof PenLine }[] = [
  { key: "awaiting", icon: PenLine },
  { key: "unopened", icon: MailOpen },
  { key: "signed", icon: CheckCircle2 },
  { key: "all", icon: FileText },
]

export const Shimmer = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "relative overflow-hidden rounded bg-muted before:absolute before:inset-0",
      "before:-translate-x-full before:animate-[shimmer_1.5s_infinite]",
      "before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent",
      className,
    )}
  />
)

export function periodLabel(row: IssuedRow, locale: string): string | null {
  if (!row.periodYear) return null
  if (!row.periodMonth) return String(row.periodYear)
  const d = new Date(Date.UTC(row.periodYear, row.periodMonth - 1, 1))
  return `${d.toLocaleDateString(locale, { month: "short", timeZone: "UTC" })} ${row.periodYear}`
}

/**
 * Where a document has got to, and who is holding it up.
 *
 * Rendered only when the type has a route. A document with none is not "1 of 1"
 * — it was never a chain, and saying so would imply the others were unfinished.
 *
 * "Waiting on whom, and for how long" is the question this screen exists to
 * answer: a chain that stalls silently is worse than no chain, because everyone
 * assumes it moved.
 */
export function ChainLine({ chain }: { chain?: DocumentChain | null }) {
  const { t } = useTranslation()
  if (!chain) return null

  if (chain.complete) {
    return (
      <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
        {t("documents.all.chain.complete", {
          defaultValue: "All {{count}} signatures collected",
          count: chain.total,
        })}
      </p>
    )
  }

  const days = chain.waitingSince
    ? Math.floor((Date.now() - new Date(chain.waitingSince).getTime()) / 86_400_000)
    : null

  return (
    <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
      {t("documents.all.chain.step", {
        defaultValue: "Step {{step}} of {{total}}",
        step: (chain.currentOrder ?? chain.signed + 1),
        total: chain.total,
      })}
      {chain.waitingOn && (
        <>
          <span className="px-1.5 text-muted-foreground/40">·</span>
          {t("documents.all.chain.waitingOn", {
            defaultValue: "waiting on {{name}}",
            name: chain.waitingOn,
          })}
        </>
      )}
      {/* Only once it has been sitting long enough to be worth saying. */}
      {days != null && days >= 1 && (
        <>
          <span className="px-1.5 text-muted-foreground/40">·</span>
          <span className={days >= 3 ? "text-amber-600 dark:text-amber-400" : undefined}>
            {t("documents.all.chain.days", { defaultValue: "{{count}} days", count: days })}
          </span>
        </>
      )}
    </p>
  )
}

/**
 * What state a document is in.
 *
 * Words, not colour alone: "awaiting signature" and "not opened" are different
 * kinds of waiting, and a viewer who cannot separate two hues would otherwise
 * read the same chip twice.
 */
export function StateChip({ row }: { row: IssuedRow }) {
  const { t } = useTranslation()

  const [label, tone] =
    row.status === "AWAITING_SIGNATURE"
      ? [t("documents.all.state.awaiting", "Awaiting signature"), "warn"]
      : row.status === "SIGNED"
        ? [t("documents.all.state.signed", "Signed"), "ok"]
        : row.status === "REVOKED"
          ? [t("documents.all.state.revoked", "Revoked"), "mute"]
          : row.status === "SUPERSEDED"
            ? [t("documents.all.state.replaced", "Replaced"), "mute"]
          : row.status === "EXPIRED"
            ? [t("documents.all.state.expired", "Expired"), "bad"]
            : !row.openedAt
              ? [t("documents.all.state.unopened", "Not opened"), "info"]
              : [t("documents.all.state.opened", "Opened"), "mute"]

  const tones: Record<string, string> = {
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    info: "bg-primary/10 text-primary",
    bad: "bg-destructive/10 text-destructive",
    mute: "bg-muted text-muted-foreground",
  }

  return (
    <span className={cn("hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-block", tones[tone])}>
      {label}
    </span>
  )
}
