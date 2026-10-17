"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { documentsApi, type MemberDocumentRow, type DocumentTypeRow, type RequirementRow } from "@/lib/api"
import { memberMayDelete } from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { useOpenDocument } from "@/hooks/use-open-document"
import { useAuth } from "@/contexts/auth-context"
import { keys } from "@/lib/query-keys"

/** MyDocumentsPage's state and handlers — everything before its markup, moved here unchanged. */
export function useMyDocumentsPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  /* Works for a client or partner — see the upload buttons below. Their page
     still lists documents ISSUED to them, which is where anything awaiting
     their signature appears. */
  const isExternalMember = user?.isExternal === true
  const queryClient = useQueryClient()
  const router = useRouter()

  const [activeType, setActiveType] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [exported, setExported] = useState<{ title: string; url: string }[] | null>(null)
  const [supplying, setSupplying] = useState(false)

  const { data: types = [] } = useQuery<DocumentTypeRow[]>({
    queryKey: keys.documents.types(),
    queryFn: () => documentsApi.listTypes(),
  })
  // Only what they supplied themselves — on an "either" type, never the office's copy.
  const mayRemove = (d: MemberDocumentRow) => {
    const dir = types.find((ty) => ty.id === d.typeId)?.direction
    return !!dir && memberMayDelete(dir, d.suppliedByMember === true)
  }

  const { data: documents = [], isLoading } = useQuery<MemberDocumentRow[]>({
    queryKey: keys.documents.mine(),
    queryFn: () => documentsApi.list(),
  })

  const { data: requirements = [] } = useQuery<RequirementRow[]>({
    queryKey: keys.documents.myRequirements(),
    queryFn: () => documentsApi.requirements(),
  })

  /*
    Filtered in the browser, not by refetching.

    A personnel file is tens of rows, not thousands — the whole set arrives in
    one request, so switching a tab is instant instead of a spinner. Search hits
    the server only if that ever stops being true.
  */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return documents.filter((d) => {
      if (activeType && d.typeId !== activeType) return false
      if (year !== null && (d.periodYear ?? new Date(d.issuedAt).getFullYear()) !== year) return false
      if (q && !d.title.toLowerCase().includes(q) && !d.typeLabel.toLowerCase().includes(q)) return false
      return true
    })
  }, [documents, activeType, year, search])

  /** Years that actually have documents — never a range with gaps in it. */
  const years = useMemo(() => {
    const set = new Set<number>()
    for (const d of documents) set.add(d.periodYear ?? new Date(d.issuedAt).getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [documents])

  /** Only tabs with something behind them. An empty tab is a dead end. */
  const usedTypes = useMemo(() => {
    const ids = new Set(documents.map((d) => d.typeId))
    return types.filter((ty) => ids.has(ty.id))
  }, [types, documents])

  const awaiting = documents.filter((d) => d.needsSignature)

  const { open, opening } = useOpenDocument({
    onOpened: () => queryClient.invalidateQueries({ queryKey: keys.documents.mine() }),
  })

  /*
    Take the whole file away.

    GDPR portability, and the reason it opens each link rather than zipping:
    the server never assembles an archive in memory, which is the same rule the
    rest of this feature follows. A browser will block a burst of automatic
    downloads, so the links are handed over as a list to click.
  */
  const exportAll = useMutation({
    mutationFn: () => documentsApi.exportMine(),
    onSuccess: (res) => {
      if (!res?.count) { notify.error(t("documents.export.nothing")); return }
      setExported(res.files)
      notify.success(t("documents.export.ready", { count: res.count }))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => {
      notify.success(t("documents.removed"))
      queryClient.invalidateQueries({ queryKey: keys.documents.mine() })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return {
    t,
    i18n,
    isExternalMember,
    router,
    activeType,
    setActiveType,
    year,
    setYear,
    search,
    setSearch,
    exported,
    setExported,
    supplying,
    setSupplying,
    types,
    mayRemove,
    documents,
    isLoading,
    requirements,
    visible,
    years,
    usedTypes,
    awaiting,
    open,
    opening,
    exportAll,
    remove,
  }
}

/** What MyDocumentsPage and its sections read. */
export type MyDocumentsPageState = ReturnType<typeof useMyDocumentsPage>
