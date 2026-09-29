"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { EyeOff, Eye, MoreHorizontal, RefreshCw, Trash2, Loader2, Upload, Check } from "lucide-react"
import { documentsApi, uploadToS3, type IssuedRow } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

/*
  Control over documents that already exist: who sees them, a new version, or
  erasing them.

  Three permissions, one per power, because each is a bigger trust than the
  last. Every control here is only a door — the server re-checks the permission,
  scopes every id by what the caller can see, and refuses a signed document
  without the explicit confirmation. Hiding a button is for the reader, never
  for security.
*/

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
function useRefreshDocuments() {
  const queryClient = useQueryClient()
  return () => {
    for (const key of [["documents-sent"], ["documents-browse"], ["my-documents"], ["credential-compliance"]]) {
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
      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
        <EyeOff className="h-3 w-3" />
        {t("documents.control.hiddenFrom", { defaultValue: "Hidden from {{name}}", name: first })}
      </span>
    )
  }
  if (row.rolesOverridden) {
    return (
      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
        <Eye className="h-3 w-3" />
        {t("documents.control.limited", "Limited")}
      </span>
    )
  }
  return null
}

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
  open, rows, onClose, onDone,
}: { open: boolean; rows: IssuedRow[]; onClose: () => void; onDone?: () => void }) {
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
    setRoleIds(overridden ? single?.visibleToRoleIds ?? [] : [])
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["document-visibility-roles"],
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
          : t("documents.control.visibilitySavedMany", { defaultValue: "Visibility updated for {{count}} documents", count: rows.length }),
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
              : t("documents.control.visibilityTitleMany", { defaultValue: "Who can see these {{count}} documents", count: rows.length })}
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
                      defaultValue: "Hidden from {{name}}. It no longer appears anywhere they can look, and they are not told.",
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
                        <button
                          key={r.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setRoleIds((ids) => (on ? ids.filter((x) => x !== r.id) : [...ids, r.id]))
                          }
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {on && <Check className="h-3 w-3" />}
                          {r.name}
                        </button>
                      )
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {roleIds.length === 0
                    ? t("documents.control.adminsOnly", "No role picked: only administrators can see it.")
                    : t("documents.control.rolesNote", "Anyone without one of these roles no longer sees it. Administrators always can.")}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || rows.length === 0}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Delete ─────────────────────────────────────────────────────────────────

function DeleteDialog({
  open, rows, onClose, onDone,
}: { open: boolean; rows: IssuedRow[]; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation()
  const refresh = useRefreshDocuments()
  const control = useDocumentControl()
  const [understood, setUnderstood] = useState(false)
  useEffect(() => { if (open) setUnderstood(false) }, [open])

  const signatures = rows.reduce((n, r) => n + (r.signatureCount ?? 0), 0)
  const needsConfirm = signatures > 0 || rows.some((r) => r.status === "SIGNED")
  const members = useMemo(() => [...new Set(rows.map((r) => r.memberName))], [rows])

  const del = useMutation({
    mutationFn: () =>
      documentsApi.deleteMany({ documentIds: rows.map((r) => r.id), confirmSignaturesLost: needsConfirm && understood }),
    onSuccess: (res) => {
      notify.success(
        t("documents.control.deleted", { defaultValue: "{{count}} documents deleted", count: res?.deleted ?? rows.length }),
      )
      refresh()
      onDone?.()
      onClose()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>
            {t("documents.control.deleteTitle", {
              defaultValue: "Delete {{count}} documents for good?",
              count: rows.length,
            })}
          </DialogTitle>
          <DialogDescription>{members.join(", ")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-border/80 bg-muted/30 p-3">
            {rows.map((r) => (
              <p key={r.id} className="truncate text-sm">
                {r.title}
                <span className="text-muted-foreground">
                  {" · "}
                  {r.typeLabel}
                  {(r.signatureCount ?? 0) > 0 &&
                    ` · ${t("documents.control.signatures", { defaultValue: "{{count}} signatures", count: r.signatureCount })}`}
                </span>
              </p>
            ))}
          </div>

          <ul className="space-y-2 text-sm">
            <li>{t("documents.control.goneForEveryone", "They disappear for the member and for everyone else. The member is not told.")}</li>
            <li>{t("documents.control.goneForGood", "The files and any signatures on them are erased. This cannot be undone.")}</li>
            <li className="text-muted-foreground">
              {t("documents.control.auditKept", "A line stays in the audit log: who deleted what, and when.")}
            </li>
          </ul>

          {needsConfirm && (
            <label
              htmlFor="doc-delete-understood"
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
            >
              <Checkbox
                id="doc-delete-understood"
                checked={understood}
                onCheckedChange={(v) => setUnderstood(v === true)}
                className="mt-0.5"
              />
              <span>
                {t("documents.control.understandSignatures", {
                  defaultValue:
                    "I understand that {{count}} signatures will be lost, and there will be no proof these documents were ever signed.",
                  count: signatures,
                })}
              </span>
            </label>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {control.canVisibility ? (
            <p className="self-center text-xs text-muted-foreground">
              {t("documents.control.hideInstead", "To keep them but hide them, use “Who can see this” instead.")}
            </p>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t("common.cancel", "Cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => del.mutate()}
              disabled={del.isPending || rows.length === 0 || (needsConfirm && !understood)}
            >
              {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("documents.control.deleteConfirm", { defaultValue: "Delete {{count}}", count: rows.length })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Replace ────────────────────────────────────────────────────────────────

function ReplaceDialog({
  open, row, onClose, onDone,
}: { open: boolean; row: IssuedRow | null; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation()
  const refresh = useRefreshDocuments()
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!open) return
    setFile(null)
    setProgress(0)
    setTitle(row?.title ?? "")
  }, [open, row?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const replace = useMutation({
    mutationFn: async () => {
      if (!row || !file) throw new Error(t("documents.control.pickFile", "Choose the new file"))
      const presigned = await documentsApi.uploadUrl({
        userId: row.memberId,
        typeId: row.typeId,
        mimeType: file.type || "application/pdf",
        sizeBytes: file.size,
      })
      if (!presigned) throw new Error(t("documents.issue.uploadFailed", "Upload failed"))
      await uploadToS3(presigned.url, file, setProgress)
      return documentsApi.confirm({
        stagingKey: presigned.key,
        userId: row.memberId,
        typeId: row.typeId,
        title: title.trim() || row.title,
        periodYear: row.periodYear ?? undefined,
        periodMonth: row.periodMonth ?? undefined,
        expiresOn: row.expiresOn ? row.expiresOn.slice(0, 10) : undefined,
        replacesId: row.id,
      })
    },
    onSuccess: () => {
      notify.success(t("documents.control.replaced", "New version sent. The old one is hidden from the member."))
      refresh()
      onDone?.()
      onClose()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !replace.isPending && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("documents.control.replaceTitle", "Replace with a new version")}</DialogTitle>
          {row && <DialogDescription>{row.title} · {row.memberName}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-4 py-5 text-left text-sm hover:bg-accent/30"
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {file ? file.name : t("documents.control.chooseFile", "Choose the new PDF")}
            </span>
          </button>
          <div className="space-y-1.5">
            <label htmlFor="doc-replace-title" className="text-sm font-medium">
              {t("documents.control.newTitle", "Title")}
            </label>
            <Input id="doc-replace-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "documents.control.replaceNote",
              "The member is asked to sign the new version if its type needs a signature. The old one is kept for your records and hidden from them.",
            )}
          </p>
          {replace.isPending && progress > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={replace.isPending}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={() => replace.mutate()} disabled={!file || replace.isPending}>
            {replace.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("documents.control.sendNewVersion", "Send new version")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Row selection shared by the register and the folder browser. */
export function useRowSelection(rows: IssuedRow[]) {
  const [ids, setIds] = useState<Set<string>>(new Set())
  // Drop ticks for rows that left the list (deleted, filtered, paged away).
  useEffect(() => {
    setIds((prev) => {
      const visible = new Set(rows.map((r) => r.id))
      const next = new Set([...prev].filter((id) => visible.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [rows])
  const selected = rows.filter((r) => ids.has(r.id))
  return {
    selected,
    isSelected: (id: string) => ids.has(id),
    toggle: (id: string) =>
      setIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    toggleAll: () => setIds((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))),
    allSelected: rows.length > 0 && ids.size === rows.length,
    clear: () => setIds(new Set()),
  }
}
