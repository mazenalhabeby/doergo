"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { Loader2, Upload } from "lucide-react"
import { documentsApi, uploadToS3, type IssuedRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { notify } from "@/lib/toast"
import { useDocumentControl, useRefreshDocuments } from "./document-row-menu"

// ── Delete ─────────────────────────────────────────────────────────────────

export function DeleteDialog({
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

export function ReplaceDialog({
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
