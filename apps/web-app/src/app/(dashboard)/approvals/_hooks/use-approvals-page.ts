"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { APPROVAL_KINDS, type ApprovalDecision, type ApprovalKind, type ApprovalInbox } from "@hbcfield/shared/client"
import { approvalsApi } from "@/lib/api"
import { keys, invalidateTimeOff } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { useRouteAccess } from "@/hooks/use-route-access"

export { itemKey } from "../_lib/approval-keys"
import { KIND_KEYS, itemKey, type Filter } from "../_lib/approval-keys"
import { useApprovalDays } from "./use-approval-days"

export type ApprovalsTab = "decide" | "rules" | "stand"

/** What keeps ↑ / ↓ for itself, so the inbox does not walk while the focus is in it. */
const USES_ARROWS =
  '[role="combobox"],[role="listbox"],[role="menu"],[role="tablist"],[role="slider"],[role="radio"],[role="radiogroup"]'

/** The inbox's state: the list, the chosen kind and item, keyboard walking, and deciding. */
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
  // "Who approves" — the office's rules — is a tab of its own (?tab=rules opens it).
  const [tab, setTabState] = useState<ApprovalsTab>("decide")
  // The inbox (a fan-out over every kind) is read only once the tab is known, and only while it is shown.
  const [tabKnown, setTabKnown] = useState(false)
  useEffect(() => {
    // Read on arrival and again on Back / Forward ("make a rule like this" adds an entry: Back is the inbox).
    const read = () => {
      const want = new URLSearchParams(window.location.search).get("tab")
      setTabState(want === "rules" || want === "stand" ? want : "decide")
    }
    read()
    setTabKnown(true)
    window.addEventListener("popstate", read)
    return () => window.removeEventListener("popstate", read)
  }, [])
  // The open tab stays in the address, so a reload or a shared link lands on it.
  const setTab = useCallback((next: ApprovalsTab) => {
    setTabState(next)
    const q = new URLSearchParams(window.location.search)
    if (next === "decide") q.delete("tab")
    else q.set("tab", next)
    window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`)
  }, [])
  const { holds, ctx } = useRouteAccess()
  // Office rules: "manage approval rules", org-wide or in a workspace (the server narrows to those workspaces).
  const managesRules = holds("any:canManageApprovalRules")
  // Who is asking is not known yet: no tab is refused and nothing is "empty" — the page is still loading.
  const accessKnown = ctx != null
  // An external member never hands their decisions on (the server refuses STAND_IN_EXTERNAL).
  const tabs = (["decide", "rules", "stand"] as const).filter(
    (k) => k === "decide" || (k === "rules" ? managesRules : !user?.isExternal),
  )
  // A tab this person may not open (a link from somebody else, a permission taken away) is the inbox.
  const shown: ApprovalsTab = (tabs as readonly string[]).includes(tab) ? tab : "decide"

  // Read for the tab SHOWN — a refused "?tab=rules" falls back to the inbox, and the inbox must then load.
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: keys.approvals.list(),
    queryFn: approvalsApi.list,
    staleTime: 15_000,
    enabled: tabKnown && accessKnown && shown === "decide",
  })

  const items = useMemo(() => data?.items ?? [], [data])
  const counts = useMemo(() => {
    const c = new Map<ApprovalKind, number>()
    for (const i of items) c.set(i.kind, (c.get(i.kind) ?? 0) + 1)
    return c
  }, [items])
  const dayState = useApprovalDays(data, filter, (key) => setSelected((s) => (s === key ? null : s)))
  const visible = useMemo(
    () =>
      (filter === "all" ? items : items.filter((i) => i.kind === filter)).filter(
        (i) => !dayState.grouped.has(itemKey(i)),
      ),
    [items, filter, dayState.grouped],
  )
  const currentDay = dayState.visibleDays.find((d) => d.key === selected) ?? null

  // The first item is chosen for you on a wide screen; a narrow one starts on the list.
  // A grouped item is opened from its day ("Review"), so it is found in the whole list.
  const current = visible.find((i) => itemKey(i) === selected) ?? items.find((i) => itemKey(i) === selected) ?? null
  useEffect(() => {
    if (current || selected?.startsWith("day:") || visible.length === 0) return
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches)
      setSelected(itemKey(visible[0]!))
  }, [current, visible, selected])

  /*
    ↑ / ↓ walk the list — a queue is worked through, not clicked through. Only on "To decide", and never while
    the focus is in something that uses the arrows itself (a field, a select, a list box, a menu, the tabs, a
    radio group such as a no-show's answers).
  */
  useEffect(() => {
    if (shown !== "decide") return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)
      )
        return
      if (el?.closest(USES_ARROWS)) return
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
  }, [visible, selected, shown])

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
      qc.setQueryData<ApprovalInbox>(keys.approvals.list(), (old) =>
        old ? { ...old, items: old.items.filter((i) => !(i.kind === d.kind && i.id === d.id)) } : old,
      )
      notify.success(t("approvals.decided", { name: done?.subject.name || t("approvals.someone") }))
      qc.invalidateQueries({ queryKey: keys.approvals.all() })
      for (const k of KIND_KEYS[d.kind] ?? []) qc.invalidateQueries({ queryKey: k })
      if (d.kind === "request") invalidateTimeOff(qc)
      if (d.kind === "guestRequest" && done?.space)
        qc.invalidateQueries({ queryKey: keys.spaces.shareRequests(done.space.id) })
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
    tabs,
    shown,
    setTab,
    managesRules,
    /** The tab and the reader's access are both known — until then no tab, header action or inbox is drawn. */
    settled: tabKnown && accessKnown,
    // Not read yet because the tab or the reader is not known: still loading, never "nothing to decide".
    isLoading: isLoading || !tabKnown || !accessKnown,
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
    currentDay,
    ...dayState,
  }
}
