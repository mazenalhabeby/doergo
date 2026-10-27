"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  isRuleKind,
  type ApprovalRuleInput,
  type ApprovalRuleView,
  type RuleKind,
  type RuleRoleView,
} from "@hbcfield/shared/client"
import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { useSpaceDirectory } from "@/hooks/use-space-directory"
import { limitFields } from "../_lib/rule-limit"
import { useAuth } from "@/contexts/auth-context"
import { isAdmin, spacesGranting } from "@hbcfield/shared/client"

/** A role a rule may name: one that grants something, how many hold it, and which kinds they can approve. */
export type RuleRole = RuleRoleView

const KIND_KEY = "approvals.rules.kind"
/** The kind to open: the link's (`?ruleKind=`, from "make a rule like this"), else this visit's last, else overtime. */
function initialKind(): RuleKind {
  if (typeof window === "undefined") return "overtime"
  const fromLink = new URLSearchParams(window.location.search).get("ruleKind")
  if (isRuleKind(fromLink)) return fromLink
  try {
    const kept = sessionStorage.getItem(KIND_KEY)
    if (isRuleKind(kept)) return kept
  } catch {
    // Storage refused: start on overtime.
  }
  return "overtime"
}

/**
 * The fields a rule card edits — EVERYTHING the server stores (a save replaces the rule whole), nothing it
 * fills in itself. A field missing here is wiped by the next edit of any other field.
 */
function ruleInput(r: ApprovalRuleView): ApprovalRuleInput {
  return {
    kind: r.kind,
    spaceId: r.spaceId,
    minMinutes: r.minMinutes,
    minDays: r.minDays,
    minAmountCents: r.minAmountCents,
    whenCoverShort: r.whenCoverShort,
    secondRoleId: r.secondRoleId,
    remindAfterHours: r.remindAfterHours,
    escalateAfterHours: r.escalateAfterHours,
    escalateRoleId: r.escalateRoleId,
    categoryId: r.categoryId,
    urgentOnly: r.urgentOnly,
    isActive: r.isActive,
  }
}

/**
 * "Who approves": the rules of ONE kind, read and written through the existing rules API
 * (`/approvals/rules`). Every change saves at once — the server checks it (ruleInputProblem) and
 * enforces it in each kind's own approve path.
 */
export function useRulesTree(enabled: boolean) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  // The kind open: from a "make a rule like this" link, else the last one this visit, else overtime.
  const [kind, setKindState] = useState<RuleKind>(initialKind)
  const setKind = useCallback((k: RuleKind) => {
    setKindState(k)
    try {
      sessionStorage.setItem(KIND_KEY, k)
    } catch {
      // Storage refused (private window): the kind is just not remembered.
    }
  }, [])

  const {
    data: rules,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: keys.approvals.rules(),
    queryFn: approvalsApi.rules,
    enabled,
  })
  // What the rules of this kind did over the last 90 days (counts only; refreshed with the rules).
  const { data: insights } = useQuery({
    queryKey: keys.approvals.ruleInsights(kind),
    queryFn: () => approvalsApi.ruleInsights(kind),
    enabled,
    staleTime: 60_000,
  })
  // The roles a rule may name — names and how many hold each, readable by whoever manages rules (any scope).
  const { data: roleRows } = useQuery({
    queryKey: keys.approvals.ruleRoles(),
    queryFn: approvalsApi.ruleRoles,
    staleTime: 5 * 60_000,
    enabled,
  })
  const { data: spaces } = useSpaceDirectory({ enabled })

  const roles = useMemo<RuleRole[]>(
    () => [...new Map((roleRows ?? []).map((r) => [r.id, r])).values()].sort((a, b) => a.name.localeCompare(b.name)),
    [roleRows],
  )

  // Held in some workspaces only: those workspaces, and never a rule for "every workspace" (the server agrees).
  const { user } = useAuth()
  const scope = useMemo(
    () =>
      !user || isAdmin(user) || user.canManageApprovalRules === true
        ? null
        : spacesGranting(user.access as never, "canManageApprovalRules"),
    [user],
  )
  const workspaces = useMemo(
    () =>
      (spaces ?? [])
        .filter((s) => s.isActive !== false && (!scope || scope.includes(s.id)))
        .map((s) => ({ id: s.id, name: s.name })),
    [spaces, scope],
  )

  /*
    After changes the rules are re-read ONCE the saves in flight are done — a re-read landing between two queued
    saves would drop the later one's change from the screen, and the save after it would send the rule without
    it. The 90-day numbers follow the rules (they count per rule). The inbox is not re-read: approvals already
    given stay when a rule changes (the server recomputes what is needed on every decision).
  */
  const pending = useRef(0)
  const refresh = () => {
    if (pending.current > 0) return
    qc.invalidateQueries({ queryKey: keys.approvals.rules() })
    qc.invalidateQueries({ queryKey: keys.approvals.ruleInsights(kind) })
  }
  const fail = (e: Error) => notify.error(e.message)

  const save = useMutation({
    mutationFn: ({ input, id }: { input: ApprovalRuleInput; id?: string }) => approvalsApi.saveRule(input, id),
    onError: fail,
  })
  const create = useMutation({
    mutationFn: (input: ApprovalRuleInput) => approvalsApi.saveRule(input),
    onSuccess: refresh,
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: (id: string) => approvalsApi.deleteRule(id),
    onSuccess: () => {
      notify.success(t("approvals.tree.removed"))
      refresh()
    },
    onError: fail,
  })

  /*
    Change one rule: the cache moves at once, the server confirms. A save REPLACES the rule, so saves are chained
    one after another — a slower earlier save can never land after a later one and undo it — and each sends the
    rule as it stands after every change before it. A rule the caller may only read is never sent.
  */
  const queue = useRef(Promise.resolve())
  const change = (r: ApprovalRuleView, patch: Partial<ApprovalRuleInput>) => {
    if (r.editable === false) return
    void qc.cancelQueries({ queryKey: keys.approvals.rules() })
    qc.setQueryData<ApprovalRuleView[]>(keys.approvals.rules(), (old) =>
      (old ?? []).map((x) => (x.id === r.id ? { ...x, ...patch } : x)),
    )
    pending.current += 1
    queue.current = queue.current.then(async () => {
      const now = qc.getQueryData<ApprovalRuleView[]>(keys.approvals.rules())?.find((x) => x.id === r.id)
      // Deleted meanwhile: nothing to save (it used to answer 404 on screen).
      if (now) await save.mutateAsync({ input: ruleInput(now), id: r.id }).catch(() => undefined)
      pending.current -= 1
      refresh()
    })
  }

  /**
   * A new rule — for one workspace, or every one when none is given. It asks the first role that can decide
   * for a second approval: a rule must DO something.
   */
  // A new rule asks a role somebody holds AND that may give this kind's approval; the office changes it after.
  const defaultRole =
    roles.find((r) => r.holders > 0 && r.decides.includes(kind)) ?? roles.find((r) => r.decides.includes(kind))
  const add = async ({ spaceId = null, limit = null }: { spaceId?: string | null; limit?: number | null } = {}) => {
    if (scope && !spaceId) spaceId = workspaces[0]?.id ?? null
    const role = defaultRole
    if (!role) {
      notify.error(t("approvals.tree.noRoles"))
      throw new Error("no role")
    }
    return create.mutateAsync({ kind, spaceId, ...limitFields(kind, limit), secondRoleId: role.id, isActive: true })
  }

  const ofKind = (rules ?? []).filter((r) => r.kind === kind)
  return {
    kind,
    setKind,
    insights,
    everywhere: !scope,
    rules: ofKind,
    counts: rules ?? [],
    isLoading,
    isError,
    error,
    refetch,
    roles,
    defaultRole,
    workspaces,
    change,
    add,
    remove,
    busy: create.isPending,
    // A manager of some workspaces only adds a rule for one of them — never before the list has loaded.
    canAdd: !scope || workspaces.length > 0,
  }
}
