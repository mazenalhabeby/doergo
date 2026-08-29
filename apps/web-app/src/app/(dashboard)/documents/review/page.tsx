"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Check, X, Eye, Loader2, Inbox, AlertTriangle, ShieldAlert, Clock,
} from "lucide-react"
import { documentsApi, type PendingReviewRow } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"

/*
  The review queue.

  Members can now supply their own certificates, and what they supply is a
  CLAIM until somebody looks at it. This screen is where that happens, and the
  whole design follows from one fact: approving is not filing. It puts somebody
  back into the assignable pool, and refusing keeps them out of it.

  So the queue is ordered oldest-first — the person waiting longest is the one
  most likely to be blocked from work — and every row says whether anybody is
  actually blocked. A queue that looked like an inbox would be worked through in
  whatever order felt tidy.

  Nothing is approved without being opened. The button that shows the document
  is the primary action in each row, and opening it is a recorded act.
*/

export default function ReviewQueuePage() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [opening, setOpening] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<PendingReviewRow | null>(null)

  const { data: rows = [], isLoading } = useQuery<PendingReviewRow[]>({
    queryKey: ["documents-awaiting-verification"],
    queryFn: () => documentsApi.awaitingVerification(),
  })

  const blocking = useMemo(() => rows.filter((r) => r.blocksWork), [rows])

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["documents-awaiting-verification"] })
    // The compliance board and every member list change with this decision.
    queryClient.invalidateQueries({ queryKey: ["credential-compliance"] })
    queryClient.invalidateQueries({ queryKey: ["my-documents"] })
  }

  const open = useMutation({
    mutationFn: (id: string) => documentsApi.downloadUrl(id),
    onMutate: (id) => setOpening(id),
    onSettled: () => setOpening(null),
    onSuccess: (res: any) => {
      if (res?.url) window.open(res.url, "_blank", "noopener,noreferrer")
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const verify = useMutation({
    mutationFn: (id: string) => documentsApi.verify(id),
    onSuccess: () => { notify.success(t("documents.review.accepted")); refresh() },
    onError: (e: Error) => notify.error(e.message),
  })

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => documentsApi.reject(id, reason),
    onSuccess: () => { notify.success(t("documents.review.refused")); setRejecting(null); refresh() },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        onClick={() => router.push("/documents")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("documents.issue.title")}
      </button>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {t("documents.review.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          {t("documents.review.explainer")}
        </p>
      </header>

      {/* People who cannot be assigned until somebody clicks. Not a count of
          documents — a count of blocked colleagues. */}
      {blocking.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {t("documents.review.blockingNotice", { count: blocking.length })}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center dark:border-slate-800">
          <Inbox className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {t("documents.review.empty")}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("documents.review.emptyHint")}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className={cn(
                "rounded-xl border bg-white p-4 dark:bg-slate-900",
                r.blocksWork
                  ? "border-amber-300 dark:border-amber-800"
                  : "border-slate-200 dark:border-slate-800",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {r.member.firstName} {r.member.lastName}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600 dark:text-slate-300">{r.typeLabel}</span>
                    {r.blocksWork && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                        <ShieldAlert className="h-3 w-3" />
                        {t("documents.review.blocksWork")}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{t("documents.review.waitingSince", {
                      date: new Date(r.submittedAt).toLocaleDateString(),
                    })}</span>
                    {r.expiresOn && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>{t("documents.review.expires", {
                          date: new Date(r.expiresOn).toLocaleDateString(),
                        })}</span>
                      </>
                    )}
                  </p>

                  {/* Approving a certificate that has ALREADY lapsed would put a
                      tick on something the dispatch gate still refuses. */}
                  {r.standing === "EXPIRED" && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {t("documents.review.alreadyExpired")}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {/* Opening it comes first, and reads as the primary act —
                      approving something nobody looked at is the one failure
                      this whole screen exists to prevent. */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => open.mutate(r.id)}
                    disabled={opening === r.id}
                  >
                    {opening === r.id
                      ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      : <Eye className="mr-1.5 h-4 w-4" />}
                    {t("documents.review.view")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => verify.mutate(r.id)}
                    disabled={verify.isPending}
                  >
                    <Check className="mr-1.5 h-4 w-4" />
                    {t("documents.review.accept")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRejecting(r)}
                    aria-label={t("documents.review.refuse")}
                  >
                    <X className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rejecting && (
        <RejectDialog
          row={rejecting}
          pending={reject.isPending}
          onCancel={() => setRejecting(null)}
          onConfirm={(reason) => reject.mutate({ id: rejecting.id, reason })}
        />
      )}
    </div>
  )
}

/**
 * Refusing, with a reason.
 *
 * The reason is mandatory here and on the server. "Not accepted" on its own is
 * an instruction to upload the same photograph again — and the second attempt
 * fails for the reason nobody gave, which is how somebody ends up unable to
 * work over a blurred corner.
 */
function RejectDialog({
  row, pending, onCancel, onConfirm,
}: {
  row: PendingReviewRow
  pending: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState("")

  const SUGGESTIONS = ["unreadable", "wrongDocument", "expired", "dateMismatch"] as const

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !pending && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t("documents.review.refuseTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("documents.review.refuseSubtitle", {
            name: row.member.firstName,
            type: row.typeLabel,
          })}
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {t("documents.review.reason")}
          </span>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("documents.review.reasonPlaceholder")}
            autoFocus
          />
        </label>

        {/* The four things that are actually wrong with a rejected upload, so
            the common case is one click rather than a sentence to compose. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((key) => (
            <button
              key={key}
              onClick={() => setReason(t(`documents.review.reasons.${key}`))}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
            >
              {t(`documents.review.reasons.${key}`)}
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason.trim())}
            disabled={!reason.trim() || pending}
          >
            {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t("documents.review.refuse")}
          </Button>
        </div>
      </div>
    </div>
  )
}
