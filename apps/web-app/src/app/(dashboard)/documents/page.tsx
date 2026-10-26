"use client"

import { useTranslation } from "react-i18next"
import { Upload, AlertTriangle, Loader2, CheckCircle2, ChevronDown, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StagedDrafts } from "./_components/staged-drafts"
import { SignerQuestions } from "./_components/signer-questions"
import { IssueRowsTable } from "./_components/issue-rows-table"
import { useIssueBatch } from "./_hooks/use-issue-batch"
import { cn } from "@/lib/utils"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Notice, PageHeader, Panel } from "@/components/page/page-kit"
import { keys } from "@/lib/query-keys"

/*
  Payroll day.

  Thirty PDFs land at once on the 25th, and nobody is going to pick a member
  from a dropdown thirty times. So filenames are read and matched, and the
  admin's job becomes reviewing a table rather than filling in a form.

  Three decisions worth stating:

  1. THE MATCH IS A SUGGESTION, AND LOOKS LIKE ONE. Three outcomes, not two:
     exact, fuzzy (offered but flagged), unmatched. Being wrong once about whose
     payslip this is cannot be undone.

  2. ALL OR NOTHING. One unresolved row blocks the publish. Releasing the rows
     that resolved would put some payslips out and hide the problem behind a
     half-finished screen.

  3. NOTHING IS VISIBLE UNTIL PUBLISH. Each file uploads and is staged as a
     draft — the member sees nothing and gets no notification until the batch is
     released, in one transaction.
*/

export default function IssueDocumentsPage() {
  const { t } = useTranslation()
  const {
    queryClient,
    rows,
    setRows,
    setRow,
    typeId,
    setTypeId,
    choices,
    setChoices,
    dragging,
    setDragging,
    uploading,
    inputRef,
    types,
    candidates,
    activeType,
    addFiles,
    onDrop,
    stageAll,
    publish,
    staged,
    unresolved,
    canStage,
    strandedDrafts,
    openQuestions,
    canPublish,
  } = useIssueBatch()

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title={t("documents.issue.title")}
        subtitle={t("documents.issue.subtitle")}
        actions={
          openQuestions.length > 0 && (
            <SignerQuestions
              drafts={openQuestions}
              choices={choices}
              onChoose={(documentId, order, who) =>
                setChoices((c) => ({ ...c, [documentId]: { ...c[documentId], [order]: who } }))
              }
            />
          )
        }
      />

      {/*
        Drafts from an earlier visit.

        ⚠️ Shown whenever any exist, NOT only when this session has no rows. The
        old banner hid itself the moment files were dropped, so somebody could
        publish a fresh batch on top of a forgotten draft and never learn it was
        there. A leak of storage and, worse, of a document somebody believes was
        sent.

        Excludes anything this session staged: those are already in the table
        below, and listing them twice makes one batch look like two.
      */}
      <StagedDrafts
        drafts={strandedDrafts}
        onPublish={(ids) => publish.mutate(ids)}
        publishing={publish.isPending}
        blockedReason={
          openQuestions.length > 0
            ? t("documents.issue.answerSignersFirst", "Answer the signing questions below first.")
            : null
        }
        onChanged={() => queryClient.invalidateQueries({ queryKey: keys.documents.drafts() })}
      />

      {/* Which kind of document this batch is */}
      <Panel className="mb-4 px-5 py-[18px]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label htmlFor="doc-type" className="text-[15px] font-semibold text-foreground">
            {t("documents.issue.documentType")}
          </label>
          <div className="relative">
            <select
              id="doc-type"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="h-10 appearance-none rounded-full border border-border bg-card pl-4 pr-9 text-sm text-foreground"
            >
              <option value="">{t("documents.issue.choose")}</option>
              {types
                .filter((ty) => ty.direction !== "SUPPLIED")
                .map((ty) => (
                  <option key={ty.id} value={ty.id}>
                    {ty.label}
                  </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {t("documents.issue.matchingAgainst", { count: candidates.length })}
          </span>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
          }}
          className={cn(
            "cursor-pointer rounded-[18px] border-2 border-dashed px-6 py-[30px] text-center transition-colors",
            dragging ? "border-primary bg-shell-accent-soft" : "border-border hover:bg-accent",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])])
              e.target.value = ""
            }}
          />
          <Upload className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-base font-semibold text-foreground">{t("documents.issue.dropHere")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("documents.issue.dropHint")}</p>
        </div>
      </Panel>

      {rows.length > 0 && (
        <>
          {/* What still needs a person */}
          {unresolved.length > 0 && (
            <Notice tone="crit" className="items-start">
              <AlertTriangle className="mt-0.5" />
              <p className="text-sm text-foreground">
                <span className="font-semibold text-shell-crit">
                  {t("documents.issue.unresolved", { count: unresolved.length })}
                </span>{" "}
                {t("documents.issue.unresolvedHint")}
              </p>
            </Notice>
          )}

          <IssueRowsTable
            rows={rows}
            candidates={candidates}
            activeType={activeType}
            uploading={uploading}
            setRow={setRow}
            setRows={setRows}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t("documents.issue.summary", { total: rows.length, staged: staged.length })}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="pill" onClick={() => setRows([])} disabled={uploading}>
                {t("common.cancel")}
              </Button>
              {staged.length < rows.length ? (
                <Button size="pillLg" onClick={stageAll} disabled={!canStage}>
                  {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("documents.issue.upload", { count: rows.length })}
                </Button>
              ) : (
                <Button
                  size="pillLg"
                  onClick={() => publish.mutate(staged.map((r) => r.documentId!).filter(Boolean))}
                  disabled={!canPublish || publish.isPending}
                >
                  {publish.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {t("documents.issue.publish", { count: staged.length })}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
