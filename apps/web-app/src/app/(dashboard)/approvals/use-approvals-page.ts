"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import {
  APPROVAL_KINDS,
  type ApprovalDecision,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalsResponse,
} from "@hbcfield/shared/client"
import { approvalsApi } from "@/lib/api"
import { keys, invalidateTimeOff } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { useRouteAccess } from "@/hooks/use-route-access"

export type Filter = ApprovalKind | "all"

/** The kind's own screen reads these — refreshed after a decision made here. */
export const KIND_KEYS: Partial<Record<ApprovalKind, QueryKey[]>> = {
  hours: [keys.attendance.approvals(), keys.attendance.pendingApprovals()],
  away: [keys.attendance.excursions()],
  extraTime: [keys.overtime.pending()],
  overtime: [keys.overtime.pending()],
  noShow: [keys.attendance.noShows()],
  issue: [keys.shiftIssues.list()],
  expense: [keys.assets.expensesPending()],
  assetProposal: [keys.assets.proposalsPending()],
  document: [keys.documents.awaitingVerification()],
  join: [keys.people.joinRequests()],
  clientRequest: [keys.portal.allRequests()],
}

export const itemKey = (i: Pick<ApprovalItem, "kind" | "id">) => `${i.kind}:${i.id}`

/** ApprovalsPage's state and handlers — everything before its markup, moved here unchanged. */
export function useApprovalsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [filter, setFilter] = useState<Filter>("all")
  const [selected, setSelected] = useState<string | null>(null)
  // Arriving from a page's "decide in Approvals" line: open on that kind.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const kind = q.get("kind")
    if (kind && (APPROVAL_KINDS as readonly string[]).includes(kind)) {
      setFilter(kind as Filter)
      // One item asked for by name (a page's "Decide in Approvals"): open it.
      const id = q.get("id")
      if (id) setSelected(`${kind}:${id}`)
    }
  }, [])
  const [standInOpen, setStandInOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  // Office rules are the organization's own policy: people managers only (the server checks the same).
  const { holds } = useRouteAccess()
  const managesPeople = holds("org:canManageUsers")

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: keys.approvals.list(),
    queryFn: approvalsApi.list,
    staleTime: 15_000,
  })

  const items = useMemo(() => data?.items ?? [], [data])
  const counts = useMemo(() => {
    const c = new Map<ApprovalKind, number>()
    for (const i of items) c.set(i.kind, (c.get(i.kind) ?? 0) + 1)
    return c
  }, [items])
  const visible = useMemo(() => (filter === "all" ? items : items.filter((i) => i.kind === filter)), [items, filter])

  // The first item is chosen for you on a wide screen; a narrow one starts on the list.
  const current = visible.find((i) => itemKey(i) === selected) ?? null
  useEffect(() => {
    if (current || visible.length === 0) return
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) setSelected(itemKey(visible[0]!))
  }, [current, visible])

  // ↑ / ↓ walk the list — a queue is worked through, not clicked through.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
      const at = visible.findIndex((i) => itemKey(i) === selected)
      const next = visible[Math.min(visible.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))]
      if (next) {
        e.preventDefault()
        setSelected(itemKey(next))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [visible, selected])

  const decide = useMutation({
    mutationFn: (d: ApprovalDecision) => approvalsApi.decide(d),
    onSuccess: (res, d) => {
      const done = items.find((i) => i.kind === d.kind && i.id === d.id)
      if (res.stage === "FIRST_STEP") {
        // Step 1 of 2: theirs is in; the item stays, now waiting for the second person.
        notify.success(t("approvals.step.firstDone", { role: res.waitingFor ?? "" }))
        qc.invalidateQueries({ queryKey: keys.approvals.all() })
        return
      }
      // Next in line BEFORE the list drops it, so the panel moves on instead of emptying.
      const at = visible.findIndex((i) => i.kind === d.kind && i.id === d.id)
      const next = visible[at + 1] ?? visible[at - 1]
      setSelected(next ? itemKey(next) : null)
      qc.setQueryData<ApprovalsResponse>(keys.approvals.list(), (old) =>
        old ? { ...old, items: old.items.filter((i) => !(i.kind === d.kind && i.id === d.id)) } : old,
      )
      notify.success(t("approvals.decided", { name: done?.subject.name || t("approvals.someone") }))
      qc.invalidateQueries({ queryKey: keys.approvals.all() })
      for (const k of KIND_KEYS[d.kind] ?? []) qc.invalidateQueries({ queryKey: k })
      if (d.kind === "request") invalidateTimeOff(qc)
      if (d.kind === "guestRequest" && done?.space) qc.invalidateQueries({ queryKey: keys.spaces.shareRequests(done.space.id) })
    },
    onError: (e: Error) => {
      notify.error(e.message)
      // Somebody else may have decided it first — read the truth again.
      qc.invalidateQueries({ queryKey: keys.approvals.all() })
    },
  })

  const onDecide = useCallback((d: ApprovalDecision) => decide.mutate(d), [decide])
  const unavailable = data?.unavailable ?? []
  // Whose decisions the reader covers today — said once, above the list.
  const covering = useMemo(
    () => [...new Set(items.filter((i) => i.why?.via === "DELEGATED" && i.why.fromName).map((i) => i.why!.fromName!))],
    [items],
  )

  return {
    t,
    user,
    filter,
    setFilter,
    selected,
    setSelected,
    standInOpen,
    setStandInOpen,
    rulesOpen,
    setRulesOpen,
    managesPeople,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
    items,
    counts,
    visible,
    current,
    decide,
    onDecide,
    unavailable,
    covering,
  }
}
