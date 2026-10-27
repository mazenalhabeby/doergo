"use client"

import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ApprovalRuleInput, ApprovalRuleView, RuleKind, RuleRoleView } from "@hbcfield/shared/client"
import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { useSpaceDirectory } from "@/hooks/use-space-directory"
import { limitFields } from "../_lib/rule-limit"
import { useAuth } from "@/contexts/auth-context"
import { isAdmin, spacesGranting } from "@hbcfield/shared/client"

/** A role a rule may name: one that grants something (a work role grants nothing), with how many hold it. */
export type RuleRole = RuleRoleView

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
  const [kind, setKind] = useState<RuleKind>("overtime")

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
    Only the rules and their numbers are re-read after a change — not the inbox, which is a fan-out over every
    kind. A rule switched off or removed closes the steps it left open, so the inbox is re-read then too.
  */
  const refresh = (inbox = false) => {
    qc.invalidateQueries({ queryKey: keys.approvals.rules() })
    if (inbox) qc.invalidateQueries({ queryKey: keys.approvals.list() })
  }
  const fail = (e: Error) => notify.error(e.message)

  const save = useMutation({
    mutationFn: ({ input, id }: { input: ApprovalRuleInput; id?: string }) => approvalsApi.saveRule(input, id),
    onSuccess: (_d, v) => refresh(v.input.isActive === false),
    onError: (e: Error) => {
      fail(e)
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => approvalsApi.deleteRule(id),
    onSuccess: () => {
      notify.success(t("approvals.tree.removed"))
      refresh(true)
    },
    onError: fail,
  })

  /*
    Change one rule: the cache moves at once, the server confirms (or the error re-reads it). A save REPLACES
    the rule, so saves are chained one after another — a slower earlier save can never land after a later one
    and undo it — and each sends the rule as it stands after every change before it.
  */
  const queue = useRef(Promise.resolve())
  const change = (r: ApprovalRuleView, patch: Partial<ApprovalRuleInput>) => {
    void qc.cancelQueries({ queryKey: keys.approvals.rules() })
    qc.setQueryData<ApprovalRuleView[]>(keys.approvals.rules(), (old) =>
      (old ?? []).map((x) => (x.id === r.id ? { ...x, ...patch } : x)),
    )
    queue.current = queue.current.then(() => {
      const now = qc.getQueryData<ApprovalRuleView[]>(keys.approvals.rules())?.find((x) => x.id === r.id) ?? r
      return save.mutateAsync({ input: ruleInput(now), id: r.id }).then(
        () => undefined,
        () => undefined,
      )
    })
  }

  /**
   * A new rule — for one workspace, or every one when none is given. It asks the first role that can decide
   * for a second approval: a rule must DO something.
   */
  // A new rule asks a role somebody actually holds; the office changes it on the canvas.
  const defaultRole = roles.find((r) => r.holders > 0) ?? roles[0]
  const add = async ({ spaceId = null, limit = null }: { spaceId?: string | null; limit?: number | null } = {}) => {
    if (scope && !spaceId) spaceId = workspaces[0]?.id ?? null
    const role = defaultRole
    if (!role) {
      notify.error(t("approvals.tree.noRoles"))
      throw new Error("no role")
    }
    return save.mutateAsync({
      input: { kind, spaceId, ...limitFields(kind, limit), secondRoleId: role.id, isActive: true },
    })
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
    busy: save.isPending,
  }
}
