"use client"

import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Upload, Loader2, FileText, X, AlertTriangle } from "lucide-react"
import { documentsApi, uploadToS3, type DocumentTypeRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

/*
  A member supplying their own document.

  Nobody could do this: uploading required `canIssueDocuments`, so a driving
  licence — a document only its holder possesses — had to be emailed to the
  office for somebody else to file. This is the other half of the model the
  schema already described with `direction: SUPPLIED`.

  Three things the dialog is careful about:

  1. IT OFFERS ONLY WHAT YOU MAY SUPPLY. Types the organization issues are not
     in the list. The server refuses them anyway; the screen should not put
     somebody in a position to be refused.

  2. IT ASKS FOR THE EXPIRY WHERE THE EXPIRY IS. A certificate is uploaded with
     its date in the same breath, not chased afterwards — and the field appears
     only for types that have one.

  3. IT SAYS WHAT HAPPENS NEXT. The upload goes into a queue for review, and a
     screen that just says "uploaded" would leave somebody believing they were
     already covered for the work.
*/

const ACCEPT = "application/pdf,image/png,image/jpeg"
const MAX_BYTES = 20 * 1024 * 1024

export function SupplyDocumentDialog({
  types,
  open,
  onClose,
}: {
  types: DocumentTypeRow[]
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const suppliable = useMemo(
    () => types.filter((ty) => ty.direction === "SUPPLIED" && ty.isActive),
    [types],
  )

  const [typeId, setTypeId] = useState(suppliable[0]?.id ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [expiresOn, setExpiresOn] = useState("")
  const [progress, setProgress] = useState(0)

  const type = suppliable.find((ty) => ty.id === typeId)

  const submit = useMutation({
    mutationFn: async () => {
      if (!file || !type) throw new Error(t("documents.supply.pickFile"))

      // Checked here as well as on the server: a 20 MB photo that fails after
      // uploading is a minute of somebody's time for nothing.
      if (file.size > MAX_BYTES) throw new Error(t("documents.supply.tooLarge"))

      const presigned = await documentsApi.ownUploadUrl({
        typeId: type.id,
        mimeType: file.type || "application/pdf",
        sizeBytes: file.size,
      })
      if (!presigned) throw new Error(t("documents.supply.failed"))

      await uploadToS3(presigned.url, file, setProgress)

      return documentsApi.submitOwn({
        stagingKey: presigned.key,
        typeId: type.id,
        title: file.name.replace(/\.[^.]+$/, ""),
        expiresOn: type.hasExpiry ? expiresOn : undefined,
      })
    },
    onSuccess: () => {
      notify.success(t("documents.supply.submitted"))
      queryClient.invalidateQueries({ queryKey: ["my-documents"] })
      reset()
      onClose()
    },
    onError: (e: Error) => {
      setProgress(0)
      notify.error(e.message)
    },
  })

  const reset = () => {
    setFile(null)
    setExpiresOn("")
    setProgress(0)
  }

  if (!open) return null

  const needsDate = !!type?.hasExpiry
  const canSubmit = !!file && !!type && (!needsDate || !!expiresOn) && !submit.isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={() => !submit.isPending && onClose()}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t("documents.supply.title")}
          </h2>
          <button
            onClick={onClose}
            disabled={submit.isPending}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50 dark:hover:text-slate-200"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {t("documents.supply.subtitle")}
        </p>

        {suppliable.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            {t("documents.supply.nothingToSupply")}
          </p>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("documents.supply.whatIsIt")}
              </span>
              <select
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {suppliable.map((ty) => (
                  <option key={ty.id} value={ty.id}>{ty.label}</option>
                ))}
              </select>
              {type?.description && (
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  {type.description}
                </span>
              )}
            </label>

            {/* The file */}
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("documents.supply.theFile")}
              </span>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={submit.isPending}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border border-dashed p-4 text-left transition-colors",
                  file
                    ? "border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
                    : "border-slate-300 hover:border-slate-400 dark:border-slate-700",
                )}
              >
                {file ? <FileText className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                      : <Upload className="h-5 w-5 shrink-0 text-slate-400" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-900 dark:text-slate-100">
                    {file ? file.name : t("documents.supply.chooseFile")}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {t("documents.supply.accepted")}
                  </span>
                </span>
              </button>
            </div>

            {/* Its expiry, asked for where it belongs */}
            {needsDate && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("documents.supply.expiresOn")}
                </span>
                <Input
                  type="date"
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                />
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  {t("documents.supply.expiresHint")}
                </span>
              </label>
            )}

            {submit.isPending && (
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full bg-blue-600 transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}

            {/* What happens next — not decoration. Somebody who thinks an upload
                covers them for the work will find out on site that it does not. */}
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {t("documents.supply.reviewNotice")}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={submit.isPending}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => submit.mutate()} disabled={!canSubmit}>
                {submit.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t("documents.supply.send")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
