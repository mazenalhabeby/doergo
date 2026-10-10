"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  documentsApi, uploadToS3,
  type DocumentTypeRow, type MatchCandidateRow, type DraftDocumentRow,
} from "@/lib/api"
import {
  matchBatch, batchIsPublishable, needsScan, mergeMatch, readContent, documentTitleFromText,
  type FileMatch, type DocumentCadence,
} from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { keys } from "@/lib/query-keys"
import { titleFor, type Row } from "../_lib/issue-rows"

/**
 * Payroll day's batch: the dropped files, how they matched, their upload and
 * staging, the signer answers, and the publish — everything the screen reads.
 */
export function useIssueBatch() {
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
    queryKey: keys.documents.types(),
    queryFn: () => documentsApi.listTypes(),
  })
  const { data: candidates = [] } = useQuery<MatchCandidateRow[]>({
    queryKey: keys.documents.matchCandidates(),
    queryFn: () => documentsApi.matchCandidates(),
  })
  const { data: existingDrafts = [] } = useQuery<DraftDocumentRow[]>({
    queryKey: keys.documents.drafts(),
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
      const { extractPdfText, mapWithLimit } = await import("@/lib/pdf-text")
      await mapWithLimit(toScan, 3, async ({ file, i }) => {
        let refined: FileMatch | null = null
        try {
          const text = await extractPdfText(file)
          refined = {
            ...mergeMatch(matches[i]!, readContent(text, candidatesRef.current)),
            // Named by its own heading, so fourteen files are not all "Employment contract".
            docTitle: documentTitleFromText(text),
          } as FileMatch
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
      queryClient.invalidateQueries({ queryKey: keys.documents.drafts() })
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
      queryClient.invalidateQueries({ queryKey: keys.documents.drafts() })
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

  return {
    queryClient,
    rows, setRows, setRow,
    typeId, setTypeId,
    choices, setChoices,
    dragging, setDragging,
    uploading, inputRef,
    types, candidates, activeType,
    addFiles, onDrop, stageAll, publish,
    staged, unresolved, failed, canStage,
    strandedDrafts, openQuestions, canPublish,
  }
}
