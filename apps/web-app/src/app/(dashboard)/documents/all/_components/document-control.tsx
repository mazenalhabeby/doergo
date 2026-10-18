"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Loader2, Check } from "lucide-react"
import { documentsApi, type IssuedRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { keys } from "@/lib/query-keys"
import { type DocumentAction, useRefreshDocuments } from "./document-row-menu"
import { DeleteDialog, ReplaceDialog } from "./delete-dialog"
import { ChoiceChip } from "@/components/ui/choice-chip"
export { useRowSelection } from "./delete-dialog"
export {
  type DocumentAction,
  useDocumentControl,
  DocumentRowMenu,
  SelectionBar,
  VisibilityChip,
} from "./document-row-menu"

/*
  Control over documents that already exist: who sees them, a new version, or
  erasing them.

  Three permissions, one per power, because each is a bigger trust than the
  last. Every control here is only a door — the server re-checks the permission,
  scopes every id by what the caller can see, and refuses a signed document
  without the explicit confirmation. Hiding a button is for the reader, never
  for security.
*/

/** Renders whichever dialog an action opened. One mount per list. */
export function DocumentActionDialogs({
  action,
  rows,
  onClose,
  onDone,
}: {
  action: DocumentAction | null
  rows: IssuedRow[]
  onClose: () => void
  onDone?: () => void
}) {
  return (
    <>
      <VisibilityDialog open={action === "visibility"} rows={rows} onClose={onClose} onDone={onDone} />
      <DeleteDialog open={action === "delete"} rows={rows} onClose={onClose} onDone={onDone} />
      <ReplaceDialog open={action === "replace"} row={rows[0] ?? null} onClose={onClose} onDone={onDone} />
    </>
  )
}

// ── Who can see this ───────────────────────────────────────────────────────

function VisibilityDialog({
  open,
  rows,
  onClose,
  onDone,
}: {
  open: boolean
  rows: IssuedRow[]
  onClose: () => void
  onDone?: () => void
}) {
  const { t } = useTranslation()
  const refresh = useRefreshDocuments()
  const single = rows.length === 1 ? rows[0] : null

  const [memberSees, setMemberSees] = useState(true)
  const [mode, setMode] = useState<"type" | "roles">("type")
  const [roleIds, setRoleIds] = useState<string[]>([])

  // Start from the document's own state each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setMemberSees(rows.length > 0 ? !rows.every((r) => r.hiddenFromMember) : true)
    const overridden = single?.rolesOverridden ?? false
    setMode(overridden ? "roles" : "type")
    setRoleIds(overridden ? (single?.visibleToRoleIds ?? []) : [])
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: keys.documents.visibilityRoles(),
    queryFn: () => documentsApi.visibilityRoles(),
    enabled: open,
    staleTime: 60_000,
  })

  const save = useMutation({
    mutationFn: () =>
      documentsApi.setVisibility({
        documentIds: rows.map((r) => r.id),
        hiddenFromMember: !memberSees,
        // For several documents with different overrides, "same as the type"
        // is only sent when chosen — never as a side effect of opening.
        roleIds: mode === "type" ? (single?.rolesOverridden || rows.length > 1 ? null : undefined) : roleIds,
      }),
    onSuccess: () => {
      notify.success(
        rows.length === 1
          ? t("documents.control.visibilitySaved", "Visibility updated")
          : t("documents.control.visibilitySavedMany", {
              defaultValue: "Visibility updated for {{count}} documents",
              count: rows.length,
            }),
      )
      refresh()
      onDone?.()
      onClose()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const memberName = single?.memberName ?? null
  const firstName = memberName?.split(" ")[0] ?? null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {rows.length === 1
              ? t("documents.control.visibilityTitle", "Who can see this document")
              : t("documents.control.visibilityTitleMany", {
                  defaultValue: "Who can see these {{count}} documents",
                  count: rows.length,
                })}
          </DialogTitle>
          {single && (
            <DialogDescription>
              {single.title} · {single.memberName}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {memberName
                    ? t("documents.control.theMember", { defaultValue: "{{name}} (the member)", name: memberName })
                    : t("documents.control.theMembers", "The members they belong to")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("documents.control.memberSeesHint", "Sees it in their file on the phone and web")}
                </p>
              </div>
              <Switch
                id="doc-member-sees"
                checked={memberSees}
                onCheckedChange={setMemberSees}
                aria-label={t("documents.control.memberSeesLabel", "The member can see it")}
              />
            </div>
            {!memberSees && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                {firstName
                  ? t("documents.control.hiddenNote", {
                      defaultValue:
                        "Hidden from {{name}}. It no longer appears anywhere they can look, and they are not told.",
                      name: firstName,
                    })
                  : t("documents.control.hiddenNoteMany", "Hidden from their members. They are not told.")}
              </p>
            )}
          </div>

          <div className="space-y-2.5">
            <p className="text-sm font-medium">{t("documents.control.whoElse", "Who else can see it")}</p>
            <div className="flex flex-wrap gap-2">
              {(["type", "roles"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    mode === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "type"
                    ? t("documents.control.sameAsType", "Same as the document type")
                    : t("documents.control.onlyRoles", "Only these roles")}
                </button>
              ))}
            </div>
            {mode === "roles" && (
              <div className="space-y-2">
                {rolesLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {roles.map((r) => {
                      const on = roleIds.includes(r.id)
                      return (
                        <ChoiceChip
                          key={r.id}
                          variant="iconPill"
                          on={on}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setRoleIds((ids) => (on ? ids.filter((x) => x !== r.id) : [...ids, r.id]))}
                        >
                          {on && <Check className="h-3 w-3" />}
                          {r.name}
                        </ChoiceChip>
                      )
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {roleIds.length === 0
                    ? t("documents.control.adminsOnly", "No role picked: only administrators can see it.")
                    : t(
                        "documents.control.rolesNote",
                        "Anyone without one of these roles no longer sees it. Administrators always can.",
                      )}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || rows.length === 0}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
