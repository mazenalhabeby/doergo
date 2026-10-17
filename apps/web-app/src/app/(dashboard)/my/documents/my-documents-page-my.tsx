"use client"

import { Download, Loader2, FileText, Image as ImageIcon, Trash2, Inbox, Clock, XCircle } from "lucide-react"
import { formatFileSize } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { dateLocale } from "@/lib/format-date"
import { MONTHS_KEY, StandingChip } from "./my-documents-page-helpers"
import type { MyDocumentsPageState } from "./use-my-documents-page"

/** Part of MyDocumentsPage's markup, moved here unchanged; it reads the page's state from `vm`. */
export function MyDocumentsPageMy({ vm }: { vm: MyDocumentsPageState }) {
  const {
    isLoading,
    visible,
    documents,
    t,
    types,
    i18n,
    router,
    open,
    opening,
    mayRemove,
    remove,
  } = vm
  return (
    <>{isLoading ? (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    ) : visible.length === 0 ? (
      <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
        <Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
          {documents.length === 0 ? t("documents.my.empty") : t("documents.noMatches")}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {documents.length === 0 ? t("documents.my.emptyHint") : t("documents.noMatchesHint")}
        </p>
      </div>
    ) : (
      <ul
        className={"divide-y divide-slate-200 overflow-hidden rounded-xl border " +
          "border-slate-200 dark:divide-slate-800 dark:border-slate-800"}>
        {visible.map((d) => {
          const isImage = d.mimeType.startsWith("image/")
          const period =
            d.periodMonth && d.periodYear
              ? `${t(`documents.months.${MONTHS_KEY[d.periodMonth - 1]}`)} ${d.periodYear}`
              : d.periodYear
                ? String(d.periodYear)
                : new Date(d.issuedAt).toLocaleDateString(dateLocale())

          return (
            <li key={d.id} className="flex items-center gap-3 bg-white px-4 py-3 dark:bg-slate-900">
              {/* Unread marker holds its width either way, so rows do not jog */}
              <span className="w-2 shrink-0" aria-hidden="true">
                {d.unread && <span className="block h-2 w-2 rounded-full bg-blue-600" />}
              </span>

              <span className="shrink-0 text-slate-400">
                {isImage ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {d.title}
                  </span>
                  {d.unread && (
                    <span
                      className={"rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold " +
                        "text-blue-700 dark:bg-blue-950 dark:text-blue-400"}>
                      {t("documents.new")}
                    </span>
                  )}
                  {/* Never in the signing queue — the app cannot clear it —
                      but silence would leave the member unaware they must
                      sign a printed copy and return it. */}
                  {types.find((ty) => ty.id === d.typeId)?.signatureMode === "WET_INK" && (
                    <span
                      className={"rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold " +
                        "text-blue-700 dark:bg-blue-950 dark:text-blue-400"}>
                      {t("documents.signOnPaper")}
                    </span>
                  )}
                  {d.needsSignature && (
                    <span
                      className={"rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold " +
                        "text-amber-700 dark:bg-amber-950 dark:text-amber-400"}>
                      {t("documents.needsSignature")}
                    </span>
                  )}
                  {/*
                    Whose document it is, when it is not the reader's.

                    A responsible countersigning nine time sheets sees nine
                    rows with the same title otherwise, and signing the wrong
                    one puts their name on somebody else's hours.
                  */}
                  {d.forMember && (
                    <span
                      className={"rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium " +
                        "text-slate-600 dark:bg-slate-800 dark:text-slate-300"}>
                      {t("documents.onBehalfOf", { name: d.forMember })}
                    </span>
                  )}
                  {/*
                    What the member supplied, and where it got to.

                    Silence here would be the worst outcome of the whole
                    upload feature: somebody uploads a licence, sees it in
                    their list, and assumes they are covered for the work —
                    while the dispatch gate, which reads status, still says
                    no. The chip is the difference between "sent" and "counts".
                  */}
                  {d.status === "PENDING_VERIFICATION" && (
                    <span
                      className={"inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 " +
                        "text-[11px] font-semibold text-slate-600 dark:bg-slate-800 " +
                        "dark:text-slate-300"}>
                      <Clock className="h-3 w-3" />
                      {t("documents.status.pendingVerification")}
                    </span>
                  )}
                  {d.status === "REJECTED" && (
                    <span
                      className={"inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 " +
                        "text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-400"}>
                      <XCircle className="h-3 w-3" />
                      {t("documents.status.rejected")}
                    </span>
                  )}
                  {/* A credential's standing is meaningless until it counts. */}
                  {d.standing && d.status !== "PENDING_VERIFICATION" && d.status !== "REJECTED" && (
                    <StandingChip standing={d.standing} expiresOn={d.expiresOn} />
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  {d.typeLabel} · {period} · {formatFileSize(d.sizeBytes, i18n.language)}
                </p>
                {/* The reason, verbatim. "Rejected" on its own is an
                    instruction to upload the same photograph again. */}
                {d.status === "REJECTED" && d.rejectionReason && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {d.rejectionReason}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {/*
                  A document waiting on the member goes to the signing flow,
                  not to a PDF viewer — opening it in a new tab and leaving
                  them to find the way back is how a request gets forgotten.
                */}
                {d.needsSignature ? (
                  <Button size="sm" onClick={() => router.push(`/my/documents/${d.id}/sign`)}>
                    {t("documents.signAction")}
                  </Button>
                ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => open.mutate(d.id)}
                  disabled={opening === d.id}
                  aria-label={t("documents.open")}
                >
                  {opening === d.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
                )}
                {/*
                  Only ever offered for what the member supplied. The server
                  refuses anything ISSUED regardless of what the UI shows —
                  this just avoids offering a button that always fails.
                */}
                {/* On an "either" type only their OWN upload — a copy the office filed is locked. */}
                {mayRemove(d) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove.mutate(d.id)}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    )}</>
  )
}
