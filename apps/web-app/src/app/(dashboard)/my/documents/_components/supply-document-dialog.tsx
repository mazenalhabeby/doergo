"use client"

import { useTranslation } from "react-i18next"
import { Upload, Loader2, FileText, AlertTriangle, ShieldCheck, CalendarDays, Pencil } from "lucide-react"
import { formatCalendarDate } from "@hbcfield/shared/client"
import { type DocumentTypeRow } from "@/lib/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSupplyDocumentDialog } from "./use-supply-document-dialog"

const ACCEPT = "application/pdf,image/png,image/jpeg"

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

  2. IT DOES NOT ASK FOR A DATE THAT IS PRINTED ON THE DOCUMENT. The expiry is
     read off the upload and STATED; the picker appears only when the document
     could not answer, or when the member disagrees with what was read. The
     ordering rule is `expiryPrompt` in shared, so the phone cannot drift from
     this — see the note on `overriding` below.

  3. IT SAYS WHAT HAPPENS NEXT. The upload goes into a queue for review, and a
     screen that just says "uploaded" would leave somebody believing they were
     already covered for the work.

  The shell is the app's own `Dialog`, the one every task dialog uses. This
  opened as a hand-rolled `fixed inset-0` div, which meant it alone missed the
  shared open animation, the focus trap, Escape-to-close and the width every
  other dialog agreed on — a modal that feels different is a modal somebody
  notices for the wrong reason.
*/

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
  const {
    inputRef,
    suppliable,
    setTypeId,
    file,
    expiresOn,
    setExpiresOn,
    progress,
    setOverriding,
    type,
    chooseFile,
    submit,
    prompt,
    canSubmit,
  } = useSupplyDocumentDialog({ types, onClose })

  return (
    <Dialog
      open={open}
      // An upload in flight is not interrupted by a stray click on the overlay
      // or by Escape: the bytes are already moving and the row is half-made.
      onOpenChange={(next) => {
        if (!next && !submit.isPending) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("documents.supply.title")}</DialogTitle>
          <DialogDescription>{t("documents.supply.subtitle")}</DialogDescription>
        </DialogHeader>

        {suppliable.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("documents.supply.nothingToSupply")}</p>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">{t("documents.supply.whatIsIt")}</span>
              <select
                value={type?.id ?? ""}
                onChange={(e) => setTypeId(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
              >
                {suppliable.map((ty) => (
                  <option key={ty.id} value={ty.id}>
                    {ty.label}
                  </option>
                ))}
              </select>
              {type?.description && (
                <span className="mt-1 block text-xs text-muted-foreground">{type.description}</span>
              )}
            </label>

            {/* The file */}
            <div>
              <span className="mb-1 block text-sm font-medium text-foreground">{t("documents.supply.theFile")}</span>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={submit.isPending}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border border-dashed p-4 text-left transition-colors",
                  file ? "border-shell-accent/40 bg-shell-accent-soft" : "border-border hover:border-foreground/30",
                )}
              >
                {file ? (
                  <FileText className="h-5 w-5 shrink-0 text-shell-accent" />
                ) : (
                  <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {file ? file.name : t("documents.supply.chooseFile")}
                  </span>
                  <span className="block text-xs text-muted-foreground">{t("documents.supply.accepted")}</span>
                </span>
              </button>
            </div>

            {/* Its expiry — read off the document, not asked for */}
            {prompt.state === "READING" && (
              <div
                className={"flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm " + "text-muted-foreground"}
              >
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                {t("documents.supply.reading")}
              </div>
            )}

            {prompt.state === "FOUND" && (
              /*
                STATED, not requested. The date sits here as something the app
                has read, with its provenance beside it — a zone expiry is
                proved by a check digit, a date off printed text is the latest
                one the page happened to show. Both save the typing; only one
                is a fact, and somebody confirming it is entitled to know which.
              */
              <div
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  prompt.certainty === "PROVEN"
                    ? "border-shell-accent/40 bg-shell-accent-soft"
                    : "border-border bg-muted",
                )}
              >
                <div className="flex items-center gap-2">
                  {prompt.certainty === "PROVEN" ? (
                    <ShieldCheck className="h-4 w-4 shrink-0 text-shell-accent" />
                  ) : (
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-foreground">
                    {t("documents.supply.expiresOnValue", {
                      date: formatCalendarDate(prompt.value),
                    })}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 pl-6">
                  <span
                    className={cn(
                      "text-xs",
                      prompt.certainty === "PROVEN" ? "text-shell-accent" : "text-muted-foreground",
                    )}
                  >
                    {prompt.certainty === "PROVEN"
                      ? t("documents.supply.dateFromDocument")
                      : t("documents.supply.dateGuessed")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOverriding(true)}
                    className={
                      "inline-flex shrink-0 items-center gap-1 text-xs font-medium " +
                      "text-muted-foreground underline-offset-2 hover:underline"
                    }
                  >
                    <Pencil className="h-3 w-3" />
                    {t("documents.supply.changeDate")}
                  </button>
                </div>
              </div>
            )}

            {prompt.state === "ASK" && (
              /*
                The last resort, and it says why it is asking. A bare required
                field with no explanation is what the member was given before,
                on every document that was not a passport.
              */
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground">
                  {t("documents.supply.expiresOn")}
                </span>
                <DatePicker
                  value={expiresOn}
                  onChange={setExpiresOn}
                  clearable
                  autoFocus={prompt.reason === "CORRECTING"}
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  {prompt.reason === "CORRECTING"
                    ? t("documents.supply.dateCorrecting")
                    : t("documents.supply.dateNotFound")}
                </span>
              </label>
            )}

            {submit.isPending && (
              <div className="h-1.5 overflow-hidden rounded-full bg-shell-chip">
                <div
                  className="h-full bg-shell-accent transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}

            {/* What happens next — not decoration. Somebody who thinks an upload
                covers them for the work will find out on site that it does not. */}
            <div
              className={
                "flex items-start gap-2.5 rounded-lg border border-transparent bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] " +
                "p-3"
              }
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-shell-warn" />
              <p className="text-sm text-foreground">{t("documents.supply.reviewNotice")}</p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="pill" onClick={onClose} disabled={submit.isPending}>
                {t("common.cancel")}
              </Button>
              <Button size="pill" onClick={() => submit.mutate()} disabled={!canSubmit}>
                {submit.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t("documents.supply.send")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
