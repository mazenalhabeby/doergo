"use client"

import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { EyeOff, Eye, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react"
import { type IssuedRow } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { keys } from "@/lib/query-keys"

export type DocumentAction = "visibility" | "replace" | "delete"

/** What this reader may do to existing documents. */
export function useDocumentControl() {
  const { hasPermission } = useAuth()
  const canVisibility = hasPermission("canManageDocumentVisibility")
  const canReplace = hasPermission("canReplaceDocuments") && hasPermission("canIssueDocuments")
  const canDelete = hasPermission("canDeleteDocuments")
  return { canVisibility, canReplace, canDelete, any: canVisibility || canReplace || canDelete }
}

/** Every list that shows documents refreshes after a change. */
export function useRefreshDocuments() {
  const queryClient = useQueryClient()
  return () => {
    for (const key of [keys.documents.sent(), keys.documents.browse(), keys.documents.mine(), keys.documents.compliance()]) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }
}

/** The ⋯ menu on one row. Renders nothing when the reader holds none of the three. */
export function DocumentRowMenu({
  row,
  onAction,
}: {
  row: IssuedRow
  onAction: (action: DocumentAction, rows: IssuedRow[]) => void
}) {
  const { t } = useTranslation()
  const control = useDocumentControl()
  if (!control.any) return null
  const replaceable = row.status !== "SUPERSEDED" && row.status !== "DRAFT"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          aria-label={t("documents.control.more", "More actions")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {control.canVisibility && (
          <DropdownMenuItem onSelect={() => onAction("visibility", [row])} className="gap-2.5">
            <EyeOff className="h-4 w-4" />
            <div>
              <p>{t("documents.control.visibility", "Who can see this…")}</p>
              <p className="text-xs text-muted-foreground">
                {t("documents.control.visibilityHint", "Hide from the member, pick roles")}
              </p>
            </div>
          </DropdownMenuItem>
        )}
        {control.canReplace && replaceable && (
          <DropdownMenuItem onSelect={() => onAction("replace", [row])} className="gap-2.5">
            <RefreshCw className="h-4 w-4" />
            <div>
              <p>{t("documents.control.replace", "Replace with new version")}</p>
              <p className="text-xs text-muted-foreground">
                {t("documents.control.replaceHint", "Upload a new file and ask for signature")}
              </p>
            </div>
          </DropdownMenuItem>
        )}
        {control.canDelete && (
          <>
            {(control.canVisibility || control.canReplace) && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onSelect={() => onAction("delete", [row])}
              className="gap-2.5 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              {t("documents.control.delete", "Delete document…")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The bar above a list while documents are ticked. */
export function SelectionBar({
  selected,
  onClear,
  onAction,
}: {
  selected: IssuedRow[]
  onClear: () => void
  onAction: (action: DocumentAction, rows: IssuedRow[]) => void
}) {
  const { t } = useTranslation()
  const control = useDocumentControl()
  if (selected.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-primary/5 px-5 py-2.5">
      <span className="text-sm font-medium tabular-nums">
        {t("documents.control.selected", { defaultValue: "{{count}} selected", count: selected.length })}
      </span>
      <span className="flex-1" />
      <Button variant="ghost" size="sm" onClick={onClear}>
        {t("documents.control.clear", "Clear")}
      </Button>
      {control.canVisibility && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onAction("visibility", selected)}>
          <EyeOff className="h-4 w-4" />
          {t("documents.control.visibilityShort", "Who can see these")}
        </Button>
      )}
      {control.canDelete && (
        <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => onAction("delete", selected)}>
          <Trash2 className="h-4 w-4" />
          {t("documents.control.deleteCount", { defaultValue: "Delete {{count}}…", count: selected.length })}
        </Button>
      )}
    </div>
  )
}

/** A label on a row whose visibility was changed, so it reads at a glance. */
export function VisibilityChip({ row }: { row: IssuedRow }) {
  const { t } = useTranslation()
  if (row.hiddenFromMember) {
    const first = row.memberName.split(" ")[0] || row.memberName
    return (
      <span
        className={"hidden shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 " +
          "text-xs font-medium text-muted-foreground sm:inline-flex"}>
        <EyeOff className="h-3 w-3" />
        {t("documents.control.hiddenFrom", { defaultValue: "Hidden from {{name}}", name: first })}
      </span>
    )
  }
  if (row.rolesOverridden) {
    return (
      <span
        className={"hidden shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 " +
          "text-xs font-medium text-muted-foreground sm:inline-flex"}>
        <Eye className="h-3 w-3" />
        {t("documents.control.limited", "Limited")}
      </span>
    )
  }
  return null
}
