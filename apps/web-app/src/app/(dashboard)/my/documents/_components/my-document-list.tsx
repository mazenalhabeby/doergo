"use client"

import { useTranslation } from "react-i18next"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Download, Loader2, FileText, Image as ImageIcon, Trash2, Inbox, Clock, XCircle } from "lucide-react"
import { formatFileSize, memberMayDelete } from "@hbcfield/shared/client"
import { Chip } from "@/components/page/page-kit"
import { Button } from "@/components/ui/button"
import { dateLocale } from "@/lib/format-date"
import { documentsApi, type MemberDocumentRow, type DocumentTypeRow } from "@/lib/api"
import { notify } from "@/lib/toast"
import { useOpenDocument } from "@/hooks/use-open-document"
import { keys } from "@/lib/query-keys"
import { StandingChip } from "./standing-chip"

const MONTHS_KEY = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const

/** The member's documents after the filters — each with its state, and open / sign / remove. */
export function MyDocumentList({
  isLoading,
  visible,
  hasDocuments,
  types,
}: {
  isLoading: boolean
  visible: MemberDocumentRow[]
  /** Whether the member has any document at all — an empty file reads differently from no matches. */
  hasDocuments: boolean
  types: DocumentTypeRow[]
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const router = useRouter()

  // Only what they supplied themselves — on an "either" type, never the office's copy.
  const mayRemove = (d: MemberDocumentRow) => {
    const dir = types.find((ty) => ty.id === d.typeId)?.direction
    return !!dir && memberMayDelete(dir, d.suppliedByMember === true)
  }

  const { open, opening } = useOpenDocument({
    onOpened: () => queryClient.invalidateQueries({ queryKey: keys.documents.mine() }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => {
      notify.success(t("documents.removed"))
      queryClient.invalidateQueries({ queryKey: keys.documents.mine() })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <>
      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[14px] bg-muted" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="py-14 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {!hasDocuments ? t("documents.my.empty") : t("documents.noMatches")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {!hasDocuments ? t("documents.my.emptyHint") : t("documents.noMatchesHint")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((d) => {
            const isImage = d.mimeType.startsWith("image/")
            const period =
              d.periodMonth && d.periodYear
                ? `${t(`documents.months.${MONTHS_KEY[d.periodMonth - 1]}`)} ${d.periodYear}`
                : d.periodYear
                  ? String(d.periodYear)
                  : new Date(d.issuedAt).toLocaleDateString(dateLocale())

            return (
              <li key={d.id} className="flex items-center gap-3 px-1 py-3">
                {/* Unread marker holds its width either way, so rows do not jog */}
                <span className="w-2 shrink-0" aria-hidden="true">
                  {d.unread && <span className="block h-2 w-2 rounded-full bg-shell-accent" />}
                </span>

                <span className="shrink-0 text-muted-foreground">
                  {isImage ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14.5px] font-semibold text-foreground">{d.title}</span>
                    {d.unread && <Chip tone="accent">{t("documents.new")}</Chip>}
                    {/* Never in the signing queue — the app cannot clear it —
                      but silence would leave the member unaware they must
                      sign a printed copy and return it. */}
                    {types.find((ty) => ty.id === d.typeId)?.signatureMode === "WET_INK" && (
                      <Chip tone="accent">{t("documents.signOnPaper")}</Chip>
                    )}
                    {d.needsSignature && <Chip tone="warn">{t("documents.needsSignature")}</Chip>}
                    {/*
                    Whose document it is, when it is not the reader's.

                    A responsible countersigning nine time sheets sees nine
                    rows with the same title otherwise, and signing the wrong
                    one puts their name on somebody else's hours.
                  */}
                    {d.forMember && <Chip tone="soft">{t("documents.onBehalfOf", { name: d.forMember })}</Chip>}
                    {/*
                    What the member supplied, and where it got to.

                    Silence here would be the worst outcome of the whole
                    upload feature: somebody uploads a licence, sees it in
                    their list, and assumes they are covered for the work —
                    while the dispatch gate, which reads status, still says
                    no. The chip is the difference between "sent" and "counts".
                  */}
                    {d.status === "PENDING_VERIFICATION" && (
                      <Chip tone="soft">
                        <Clock className="h-3 w-3" />
                        {t("documents.status.pendingVerification")}
                      </Chip>
                    )}
                    {d.status === "REJECTED" && (
                      <Chip tone="crit">
                        <XCircle className="h-3 w-3" />
                        {t("documents.status.rejected")}
                      </Chip>
                    )}
                    {/* A credential's standing is meaningless until it counts. */}
                    {d.standing && d.status !== "PENDING_VERIFICATION" && d.status !== "REJECTED" && (
                      <StandingChip standing={d.standing} expiresOn={d.expiresOn} />
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] tabular-nums text-muted-foreground">
                    {d.typeLabel} · {period} · {formatFileSize(d.sizeBytes, i18n.language)}
                  </p>
                  {/* The reason, verbatim. "Rejected" on its own is an
                    instruction to upload the same photograph again. */}
                  {d.status === "REJECTED" && d.rejectionReason && (
                    <p className="mt-1 text-xs text-shell-crit">{d.rejectionReason}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {/*
                  A document waiting on the member goes to the signing flow,
                  not to a PDF viewer — opening it in a new tab and leaving
                  them to find the way back is how a request gets forgotten.
                */}
                  {d.needsSignature ? (
                    <Button
                      size="sm"
                      className="h-8 rounded-full px-3.5"
                      onClick={() => router.push(`/my/documents/${d.id}/sign`)}
                    >
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
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
