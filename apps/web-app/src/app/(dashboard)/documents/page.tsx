"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Upload, Check, AlertTriangle, X, Loader2, FileText,
  CheckCircle2, ChevronDown, Users,
} from "lucide-react"
import {
  documentsApi, uploadToS3,
  type DocumentTypeRow, type MatchCandidateRow, type DraftDocumentRow,
} from "@/lib/api"
import {
  matchBatch, batchIsPublishable, needsScan, mergeMatch, readContent,
  type FileMatch, type DocumentCadence,
} from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { StagedDrafts } from "./_components/staged-drafts"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

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

type Row = FileMatch & {
  file: File
  state: "pending" | "uploading" | "staged" | "failed"
  progress: number
  documentId?: string
  error?: string
  /** True while the file is being read, so the row can say so rather than sit blank. */
  scanning?: boolean
}

const MONTHS_KEY = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function IssueDocumentsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [rows, setRows] = useState<Row[]>([])
  const [typeId, setTypeId] = useState<string>("")
  /*
    Who signs each ambiguous step, per staged document.

    Only ambiguous ones are held here: a step with one candidate resolves
    itself, and one with none becomes a skipped step. Keyed by document so a
    batch of thirty time sheets can have different approvers per member.
  */
  const [choices, setChoices] = useState<
    Record<string, Record<number, { userId?: string; customerId?: string; email?: string; name?: string }>>
  >({})
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: types = [] } = useQuery<DocumentTypeRow[]>({
    queryKey: ["document-types"],
    queryFn: () => documentsApi.listTypes(),
  })
  const { data: candidates = [] } = useQuery<MatchCandidateRow[]>({
    queryKey: ["document-match-candidates"],
    queryFn: () => documentsApi.matchCandidates(),
  })
  const { data: existingDrafts = [] } = useQuery<DraftDocumentRow[]>({
    queryKey: ["document-drafts"],
    queryFn: () => documentsApi.listDrafts(),
  })

  const activeType = types.find((ty) => ty.id === typeId) ?? null

  /*
    Reading a batch is asynchronous and the person carries on using the screen
    while it runs. These refs are what the scan reads, so a roster that finished
    loading, or a type chosen a second after the drop, is the one that applies —
    rather than whatever happened to be captured when the files landed.
  */
  const activeTypeRef = useRef(activeType)
  const candidatesRef = useRef(candidates)
  const rowsRef = useRef(rows)
  useEffect(() => { activeTypeRef.current = activeType }, [activeType])
  useEffect(() => { candidatesRef.current = candidates }, [candidates])
  useEffect(() => { rowsRef.current = rows }, [rows])

  /**
   * Match the dropped files, in the browser.
   *
   * Two passes, and the second one usually does not happen. The filename is
   * read first because it is free and, for a payroll export named
   * `2026-08_holub_monika.pdf`, it is the whole answer. Only the rows it left
   * unanswered are then READ — see `needsScan`, which is where that rule lives.
   *
   * The first pass renders immediately so the table appears at once; the second
   * refines rows in place as each file finishes, which is why the rows carry a
   * `scanning` flag rather than the screen showing a spinner over everything.
   */
  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return
    const matches = matchBatch(files.map((f) => f.name), candidates)

    const cadence = (activeTypeRef.current?.cadence ?? "ONE_OFF") as DocumentCadence
    const toScan = files
      .map((file, i) => ({ file, i }))
      .filter(({ file, i }) =>
        file.type === "application/pdf" && needsScan(matches[i]!, cadence),
      )

    const startIndex = rowsRef.current.length
    setRows((prev) => [
      ...prev,
      ...files.map((file, i) => ({
        ...matches[i]!,
        file,
        state: "pending" as const,
        progress: 0,
        scanning: toScan.some((t) => t.i === i),
      })),
    ])
    if (toScan.length === 0) return

    /*
      Reading happens off the render path and never blocks the drop. A file that
      cannot be parsed — encrypted, corrupt, a photo saved as .pdf — simply
      leaves the row as the filename found it, which is exactly where it was
      before any of this existed.
    */
    void (async () => {
      const { extractPdfText, mapWithLimit } = await import("./_lib/pdf-text")
      await mapWithLimit(toScan, 3, async ({ file, i }) => {
        let refined: FileMatch | null = null
        try {
          const text = await extractPdfText(file)
          refined = mergeMatch(matches[i]!, readContent(text, candidatesRef.current))
        } catch {
          refined = null
        }
        setRows((prev) =>
          prev.map((r, idx) =>
            idx === startIndex + i ? { ...r, ...(refined ?? {}), scanning: false } : r,
          ),
        )
      })
    })()
  }, [candidates])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles([...e.dataTransfer.files])
  }, [addFiles])

  const setRow = (fileName: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.fileName === fileName ? { ...r, ...patch } : r)))

  /*
    Upload each file and stage it.

    Sequential on purpose. Thirty parallel uploads saturate an office
    connection and make the progress column meaningless; one at a time is
    slower on paper and far easier to watch — and if one fails, exactly one row
    turns red rather than the whole screen.
  */
  const stageAll = useCallback(async () => {
    if (!typeId) { notify.error(t("documents.issue.pickType")); return }
    setUploading(true)
    try {
      for (const row of rows) {
        if (row.state === "staged" || !row.userId) continue
        setRow(row.fileName, { state: "uploading", progress: 0 })
        try {
          const presigned = await documentsApi.uploadUrl({
            userId: row.userId,
            typeId,
            mimeType: row.file.type || "application/pdf",
            sizeBytes: row.file.size,
          })
          if (!presigned) throw new Error(t("documents.issue.uploadFailed"))

          await uploadToS3(presigned.url, row.file, (p) =>
            setRow(row.fileName, { progress: p }),
          )

          const doc = await documentsApi.confirm({
            stagingKey: presigned.key,
            userId: row.userId,
            typeId,
            title: titleFor(row, activeType, t),
            periodYear: row.periodYear ?? undefined,
            periodMonth: row.periodMonth ?? undefined,
            asDraft: true,
          })
          setRow(row.fileName, { state: "staged", progress: 1, documentId: doc?.id })
        } catch (err) {
          setRow(row.fileName, {
            state: "failed",
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      queryClient.invalidateQueries({ queryKey: ["document-drafts"] })
    } finally {
      setUploading(false)
    }
  }, [rows, typeId, activeType, queryClient, t])

  const publish = useMutation({
    mutationFn: (ids: string[]) =>
      documentsApi.publishBatch(
        ids,
        Object.entries(choices)
          .filter(([id]) => ids.includes(id))
          .map(([documentId, byOrder]) => ({
            documentId,
            choices: Object.entries(byOrder).map(([order, who]) => ({ order: Number(order), ...who })),
          })),
      ),
    onSuccess: (res) => {
      notify.success(t("documents.issue.published", { count: res?.published ?? 0 }))
      setRows([])
      queryClient.invalidateQueries({ queryKey: ["document-drafts"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const staged = rows.filter((r) => r.state === "staged")
  const unresolved = rows.filter((r) => !r.userId)
  const failed = rows.filter((r) => r.state === "failed")
  const canStage = rows.length > 0 && batchIsPublishable(rows) && !!typeId && !uploading
  /*
    Every ambiguous step must be answered before anything is published.

    All-or-nothing, like the rest of this screen: publishing the drafts whose
    signers resolved and leaving the rest would split a batch that was assembled
    as one, and the half that failed would be discovered later by somebody
    wondering why a time sheet never arrived.
  */
  const answered = (
    c: { userId?: string; customerId?: string; email?: string } | undefined,
  ): boolean => {
    if (!c) return false
    if (c.userId || c.customerId) return true
    // A typed-in counterparty counts as answered only once it is actually
    // typed. An empty box is a question still open, not a choice.
    return !!c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)
  }

  /*
    Drafts that are NOT part of what is on screen right now — the ones nothing
    else on this page can reach, which is exactly the set worth surfacing.
  */
  const sessionIds = new Set(rows.map((r) => r.documentId).filter(Boolean))
  const strandedDrafts = existingDrafts.filter((d) => !sessionIds.has(d.id))

  const openQuestions = existingDrafts.filter((d) =>
    (d.routeSteps ?? []).some(
      (s) =>
        // No candidate at all is still a question — it is answered by typing
        // somebody in, which is the whole point of the manual option.
        (s.candidates.length !== 1 || s.role === "CUSTOMER") && !answered(choices[d.id]?.[s.order]),
    ),
  )

  const canPublish =
    staged.length > 0 &&
    staged.length === rows.length &&
    failed.length === 0 &&
    !uploading &&
    openQuestions.length === 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {t("documents.issue.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("documents.issue.subtitle")}
          </p>
        </div>
        {openQuestions.length > 0 && (
          <SignerQuestions
            drafts={openQuestions}
            choices={choices}
            onChoose={(documentId, order, who) =>
              setChoices((c) => ({ ...c, [documentId]: { ...c[documentId], [order]: who } }))
            }
          />
        )}
      </header>

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
        onChanged={() => queryClient.invalidateQueries({ queryKey: ["document-drafts"] })}
      />

      {/* Which kind of document this batch is */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="doc-type" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {t("documents.issue.documentType")}
        </label>
        <div className="relative">
          <select
            id="doc-type"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className="h-10 appearance-none rounded-md border border-slate-200 bg-white pl-3 pr-9 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">{t("documents.issue.choose")}</option>
            {types.filter((ty) => ty.direction === "ISSUED").map((ty) => (
              <option key={ty.id} value={ty.id}>{ty.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Users className="h-3.5 w-3.5" />
          {t("documents.issue.matchingAgainst", { count: candidates.length })}
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click() }}
        className={cn(
          "mb-5 cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
            : "border-slate-300 bg-slate-50 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = "" }}
        />
        <Upload className="mx-auto h-7 w-7 text-slate-400" />
        <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-200">
          {t("documents.issue.dropHere")}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("documents.issue.dropHint")}
        </p>
      </div>

      {rows.length > 0 && (
        <>
          {/* What still needs a person */}
          {unresolved.length > 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-semibold text-red-700 dark:text-red-400">
                  {t("documents.issue.unresolved", { count: unresolved.length })}
                </span>{" "}
                {t("documents.issue.unresolvedHint")}
              </p>
            </div>
          )}

          <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("documents.issue.file")}</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("documents.issue.member")}</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("documents.issue.match")}</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("documents.issue.period")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <tr
                    key={row.fileName}
                    className={cn(
                      !row.userId && "bg-red-50 dark:bg-red-950/30",
                      row.state === "failed" && "bg-red-50 dark:bg-red-950/30",
                      row.state === "staged" && "bg-green-50/50 dark:bg-green-950/20",
                    )}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">{row.fileName}</span>
                      </div>
                      <div className="mt-0.5 pl-6 text-[11px] text-slate-400">{fileSize(row.file.size)}</div>
                      {row.state === "uploading" && (
                        <div className="mt-1 ml-6 h-1 w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                          <div className="h-full bg-blue-600 transition-all" style={{ width: `${row.progress * 100}%` }} />
                        </div>
                      )}
                      {row.error && <div className="mt-1 pl-6 text-[11px] text-red-600">{row.error}</div>}
                    </td>

                    <td className="px-3 py-2">
                      {/*
                        A select, not a label, even for an exact match. The
                        admin can override any row without deleting and
                        re-adding the file, which is what makes reviewing a
                        thirty-row table tolerable.
                      */}
                      <select
                        value={row.userId ?? ""}
                        disabled={row.state === "staged" || uploading}
                        onChange={(e) =>
                          setRow(row.fileName, {
                            userId: e.target.value || null,
                            confidence: e.target.value ? "EXACT" : "UNMATCHED",
                            reason: e.target.value ? "chosen by hand" : "no member chosen",
                          })
                        }
                        aria-label={t("documents.issue.member")}
                        className="w-full max-w-[220px] rounded border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="">{t("documents.issue.pickMember")}</option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                        ))}
                      </select>
                    </td>

                    <td className="px-3 py-2">
                      <MatchChip row={row} />
                    </td>

                    <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                      <PeriodCell
                        row={row}
                        cadence={(activeType?.cadence ?? "ONE_OFF") as DocumentCadence}
                        onChange={(patch) => setRow(row.fileName, patch)}
                      />
                    </td>

                    <td className="px-3 py-2">
                      {row.state !== "staged" && (
                        <button
                          onClick={() => setRows((prev) => prev.filter((r) => r.fileName !== row.fileName))}
                          aria-label={t("common.remove")}
                          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("documents.issue.summary", { total: rows.length, staged: staged.length })}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRows([])} disabled={uploading}>
                {t("common.cancel")}
              </Button>
              {staged.length < rows.length ? (
                <Button onClick={stageAll} disabled={!canStage}>
                  {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("documents.issue.upload", { count: rows.length })}
                </Button>
              ) : (
                <Button
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

function MatchChip({ row }: { row: Row }) {
  const { t } = useTranslation()
  if (row.state === "staged") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:bg-green-950 dark:text-green-400">
        <Check className="h-3 w-3" />{t("documents.issue.staged")}
      </span>
    )
  }
  if (row.state === "failed") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
        {t("documents.issue.failed")}
      </span>
    )
  }
  const map: Record<string, string> = {
    EXACT: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
    FUZZY: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    UNMATCHED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", map[row.confidence])}>
        {row.scanning
          ? t("documents.issue.reading", "reading the file…")
          : t(`documents.issue.confidence.${row.confidence.toLowerCase()}`)}
      </span>
      {row.memberSource === "content" && (
        <span className="text-[10.5px] text-blue-600 dark:text-blue-400">
          {t("documents.issue.fromFile", "read from the file")}
        </span>
      )}
    </span>
  )
}

/**
 * The period, and a way to supply one.
 *
 * ⚠️ It has to be editable. Reading the filename and then the file itself
 * answers most rows, but not all — a photograph saved as a PDF, an invoice that
 * dates itself only in a sentence, a scan. Before this, such a row could only be
 * fixed by cancelling, renaming the file outside the app and dropping it again,
 * while the screen showed the type's rule rather than a way to satisfy it.
 *
 * Where the value CAME from is shown, because "read out of the document" and
 * "typed by me" deserve different amounts of scrutiny from a reviewer, and a
 * value that appeared from nowhere invites nobody to check it.
 */
function PeriodCell({
  row,
  cadence,
  onChange,
}: {
  row: Row
  cadence: DocumentCadence
  onChange: (patch: Partial<Row>) => void
}) {
  const { t } = useTranslation()
  if (cadence === "ONE_OFF") return <span className="text-slate-400">—</span>
  if (row.scanning) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("documents.issue.reading", "reading the file…")}
      </span>
    )
  }

  const needsMonth = cadence === "MONTHLY"
  const yearOptions = (() => {
    const now = new Date().getFullYear()
    return [now + 1, now, now - 1, now - 2]
  })()

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {needsMonth && (
          <select
            value={row.periodMonth ?? ""}
            onChange={(e) =>
              onChange({ periodMonth: e.target.value ? Number(e.target.value) : null, periodSource: undefined })
            }
            className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">{t("documents.issue.month", "Month")}</option>
            {MONTHS_KEY.map((m, i) => (
              <option key={m} value={i + 1}>{t(`documents.months.${m}`)}</option>
            ))}
          </select>
        )}
        <select
          value={row.periodYear ?? ""}
          onChange={(e) =>
            onChange({ periodYear: e.target.value ? Number(e.target.value) : null, periodSource: undefined })
          }
          className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[12px] tabular-nums dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">{t("documents.issue.year", "Year")}</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {row.periodSource === "content" && (
        <span className="text-[10.5px] text-blue-600 dark:text-blue-400">
          {t("documents.issue.fromFile", "read from the file")}
        </span>
      )}
      {row.periodConflict && (
        <span className="text-[10.5px] font-medium text-amber-600 dark:text-amber-400">
          {t("documents.issue.periodConflict", "the filename and the file disagree — check this one")}
        </span>
      )}
    </div>
  )
}

/** A title a person would recognise in their own document list. */
function titleFor(row: Row, type: DocumentTypeRow | null, t: (k: string) => string): string {
  const label = type?.label ?? "Document"
  if (row.periodMonth && row.periodYear) {
    return `${label} ${t(`documents.months.${MONTHS_KEY[row.periodMonth - 1]}`)} ${row.periodYear}`
  }
  if (row.periodYear) return `${label} ${row.periodYear}`
  return label
}

/*
  Who signs, when the route leaves it open.

  A route names ROLES, and a role usually resolves to exactly one person — that
  step never reaches this panel. It appears only where the answer is genuinely
  ambiguous: a member with two people who can approve for them, an organisation
  with several representatives. Asking then is not friction, it is the only
  moment anybody knows the answer.

  Deliberately not a default-to-the-first-candidate: picking a signer for
  somebody and being wrong sends a document to the wrong desk, and the person it
  actually needed never learns it existed.
*/
/** One answer to "who signs this step" — a person on file, or one typed in. */
type SignerChoice = { userId?: string; customerId?: string; email?: string; name?: string }

function SignerQuestions({
  drafts,
  choices,
  onChoose,
}: {
  drafts: DraftDocumentRow[]
  choices: Record<string, Record<number, SignerChoice>>
  onChoose: (documentId: string, order: number, who: SignerChoice) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="w-full rounded-xl border border-border/80 bg-card p-4">
      <div className="mb-3 flex items-start gap-2">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold">{t("documents.issue.signers.title")}</p>
          <p className="text-xs text-muted-foreground">{t("documents.issue.signers.hint")}</p>
        </div>
      </div>

      <div className="space-y-3">
        {drafts.map((d) => (
          <div key={d.id} className="rounded-lg border border-border/60 bg-accent/30 p-3">
            <p className="mb-2 text-sm font-medium">
              {d.user.firstName} {d.user.lastName}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{d.type.label}</span>
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              {(d.routeSteps ?? [])
                .filter((s) => s.candidates.length !== 1 || s.role === "CUSTOMER")
                .map((s) => {
                  const picked = choices[d.id]?.[s.order]
                  const value = picked?.userId ?? picked?.customerId ?? ""
                  return (
                    <label key={s.order} className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t(`documents.types.route.roles.${s.role}`, { defaultValue: s.role })}
                      </span>
                      <select
                        value={picked?.email ? "__manual__" : value}
                        onChange={(e) => {
                          if (e.target.value === "__manual__") {
                            onChoose(d.id, s.order, { email: "", name: "" })
                            return
                          }
                          const c = s.candidates.find((x) => x.id === e.target.value)
                          if (!c) return
                          onChoose(
                            d.id,
                            s.order,
                            c.kind === "USER" ? { userId: c.id } : { customerId: c.id },
                          )
                        }}
                        className="h-9 appearance-none rounded-md border border-border bg-background px-3 text-sm"
                      >
                        <option value="" disabled>
                          {t("documents.issue.signers.choose")}
                        </option>
                        {s.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.email ? ` · ${c.email}` : ""}
                          </option>
                        ))}
                        {/*
                          Always offered, whatever the space could suggest.

                          A closed list is exactly useless the one time somebody
                          must send a document to a person who is not a member,
                          not a CRM client and not a space's contact — which is
                          an ordinary Tuesday, not an edge case.
                        */}
                        <option value="__manual__">
                          {t("documents.issue.signers.manual", "Someone else…")}
                        </option>
                      </select>
                      {picked?.email !== undefined && !picked.userId && !picked.customerId && (
                        <span className="mt-1 flex flex-col gap-1">
                          <input
                            value={picked.name ?? ""}
                            onChange={(e) =>
                              onChoose(d.id, s.order, { ...picked, name: e.target.value })
                            }
                            placeholder={t("documents.issue.signers.manualName", "Their name")}
                            className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
                          />
                          <input
                            type="email"
                            value={picked.email ?? ""}
                            onChange={(e) =>
                              onChoose(d.id, s.order, { ...picked, email: e.target.value })
                            }
                            placeholder={t("documents.issue.signers.manualEmail", "Their email address")}
                            className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
                          />
                        </span>
                      )}
                    </label>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
