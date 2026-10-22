"use client"

import { useEffect, useRef, useState } from "react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { documentsApi, type IssuedRegister, type IssuedRow } from "@/lib/api"
import { useOpenDocument } from "@/hooks/use-open-document"
import { useDocumentControl, useRowSelection, type DocumentAction } from "../_components/document-control"
import { keys } from "@/lib/query-keys"

/*
  What the organization has sent.

  Every other document list answers "what does THIS PERSON have" — the member's
  own file, or one record opened from the team page. So an admin could inspect
  people one at a time and never see the shape of the whole thing: what went
  out, who never opened it, what is still unsigned.

  Two ways of looking, not two screens. ATTENTION is the working queue and
  opens on what is unsigned, because a register that opens on five hundred rows
  newest-first is one nobody opens twice. FILES is the cabinet, for finding a
  document you already know exists. They answer different questions and share
  nothing but the data, so they sit behind one switch.

  No row carries a link. Opening mints one and records the open, which is what
  makes the delivery evidence mean anything.
*/

export type Tab = "awaiting" | "unopened" | "signed" | "all"

/** SentDocumentsPage's state and handlers — everything before its markup, moved here unchanged. */
export function useSentDocumentsPage() {
  const { t, i18n } = useTranslation()
  const router = useRouter()

  const [view, setView] = useState<"attention" | "files">("attention")
  const [tab, setTab] = useState<Tab>("awaiting")
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 300)
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching } = useQuery<IssuedRegister>({
    queryKey: keys.documents.sent(tab, debouncedSearch, page),
    queryFn: () => documentsApi.listIssued({ tab, search: debouncedSearch || undefined, page }),
    // The register moves when somebody signs or opens something, neither of
    // which happens while an admin watches this screen.
    staleTime: 30_000,
  })

  const rows = data?.rows ?? []
  const counts = data?.counts

  // Hide / replace / delete. Ticking only appears for someone who can act on a
  // selection; the menu per row covers the rest.
  const control = useDocumentControl()
  const canSelect = control.canVisibility || control.canDelete
  const selection = useRowSelection(rows)
  const [action, setAction] = useState<{ kind: DocumentAction; rows: IssuedRow[] } | null>(null)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  /*
    Open on a tab that has something in it.

    "Awaiting signature" is the right default when anything is waiting — it is
    the only tab describing work. But an organization with nothing outstanding
    got an empty screen while its documents sat one click away in a tab it had
    to think to press, which reads as "there is nothing here" rather than "there
    is nothing to do".

    So the default is the FIRST tab with rows, in order of urgency, and only
    until the reader chooses for themselves. After that their choice stands,
    including when they deliberately open an empty tab to confirm it is empty.
  */
  const userPicked = useRef(false)
  useEffect(() => {
    if (userPicked.current || !counts) return
    if (counts[tab] > 0) return
    const fallback = (["awaiting", "unopened", "signed", "all"] as Tab[]).find((k) => counts[k] > 0)
    if (fallback) setTab(fallback)
  }, [counts, tab])

  const { open, opening } = useOpenDocument({
    errorMessage: (e) => e?.message ?? t("documents.all.openFailed", "Could not open the document"),
  })

  return {
    t,
    i18n,
    router,
    view,
    setView,
    tab,
    setTab,
    search,
    setSearch,
    page,
    setPage,
    data,
    isLoading,
    isFetching,
    rows,
    counts,
    canSelect,
    selection,
    action,
    setAction,
    totalPages,
    userPicked,
    open,
    opening,
  }
}

/** What SentDocumentsPage and its sections read. */
export type SentDocumentsPageState = ReturnType<typeof useSentDocumentsPage>
