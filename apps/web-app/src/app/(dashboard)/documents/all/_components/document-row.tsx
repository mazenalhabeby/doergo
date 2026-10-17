"use client"

import { useTranslation } from "react-i18next"
import { FolderOpen, FileText, Eye, Loader2, User, Calendar, Layers } from "lucide-react"
import { type IssuedRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { DocumentRowMenu, VisibilityChip, type DocumentAction } from "./document-control"

export type GroupBy = "type" | "member" | "year"

export type Crumb = { kind: "type" | "member" | "year"; key: string; label: string; undated: boolean }

export const GROUPS: { key: GroupBy; icon: typeof Layers }[] = [
  { key: "type", icon: Layers },
  { key: "member", icon: User },
  { key: "year", icon: Calendar },
]

/** Loading that keeps the shape of what is coming, rather than a spinner. */
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

export function Empty() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
        <FolderOpen className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <p className="text-sm text-muted-foreground">
        {t("documents.all.emptyFolder", "This folder is empty.")}
      </p>
    </div>
  )
}

export function DocumentRow({
  doc, index, locale, busy, onOpen, selectable, selected, onToggle, onAction,
}: {
  doc: IssuedRow; index: number; locale: string; busy: boolean; onOpen: () => void
  selectable: boolean; selected: boolean; onToggle: () => void
  onAction: (kind: DocumentAction, rows: IssuedRow[]) => void
}) {
  const { t } = useTranslation()
  const month =
    doc.periodYear && doc.periodMonth
      ? new Date(Date.UTC(doc.periodYear, doc.periodMonth - 1, 1)).toLocaleDateString(locale, {
          month: "long", timeZone: "UTC",
        })
      : null

  return (
    <div
      style={{ animation: `fadeSlideIn 0.25s ease-out ${index * 40}ms both` }}
      className={cn(
        "group flex items-center gap-4 border-b border-border/50 px-5 py-3.5 transition-colors last:border-0 hover:bg-accent/30",
        selected && "bg-primary/5",
      )}
    >
      {selectable && (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={t("documents.control.selectOne", { defaultValue: "Select {{title}}", title: doc.title })}
        />
      )}
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
        <p className="truncate text-sm text-muted-foreground">
          {month ?? doc.memberName}
          {month && (
            <>
              <span className="px-1.5 text-muted-foreground/40">·</span>
              {doc.memberName}
            </>
          )}
        </p>
      </div>
      <VisibilityChip row={doc} />
      {!doc.openedAt && (
        <span className="hidden shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary sm:inline-block">
          {t("documents.all.state.unopened", "Not opened")}
        </span>
      )}
      <Button
        variant="ghost" size="icon"
        className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        disabled={busy} onClick={onOpen}
        aria-label={t("documents.all.open", "Open")}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
      </Button>
      <DocumentRowMenu row={doc} onAction={onAction} />
    </div>
  )
}
